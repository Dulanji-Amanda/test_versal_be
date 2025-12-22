import { Request, Response } from "express"
import { IUSER, Role, User } from "../models/user.model"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { signAccessToken, signRefreshToken } from "../utils/tokens"
import { sendEmail } from "../utils/email"
import { AUthRequest } from "../middleware/auth"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
dotenv.config()

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET as string

export const registerUser = async (req: Request, res: Response) => {
  try {
    const { email, password, firstname, lastname } = req.body

    // left email form model, right side data varible
    //   User.findOne({ email: email })
    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "Email exists" })
    }

    const hash = await bcrypt.hash(password, 10)

    //   new User()
    const user = await User.create({
      email,
      password: hash,
      firstname,
      lastname,
      roles: [Role.USER]
    })

    res.status(201).json({
      message: "User registed",
      data: { email: user.email, roles: user.roles }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: "Internal; server error"
    })
  }
}

export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    const existingUser = (await User.findOne({ email })) as IUSER | null
    if (!existingUser) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const valid = await bcrypt.compare(password, existingUser.password)
    if (!valid) {
      return res.status(401).json({ message: "Invalid credentials" })
    }

    const accessToken = signAccessToken(existingUser)
    const refreshToken = signRefreshToken(existingUser)

    res.status(200).json({
      message: "success",
      data: {
        email: existingUser.email,
        roles: existingUser.roles,
        accessToken,
        refreshToken
      }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: "Internal; server error"
    })
  }
}

export const registerAdmin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    const existingUser = await User.findOne({ email })
    if (existingUser) {
      return res.status(400).json({ message: "Email exists" })
    }

    const hash = await bcrypt.hash(password, 10)

    const user = await User.create({
      email,
      password: hash,
      roles: [Role.ADMIN]
    })

    res.status(201).json({
      message: "Admin registed",
      data: { email: user.email, roles: user.roles }
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      message: "Internal server error"
    })
  }
}

export const getMyProfile = async (req: AUthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" })
  }
  const user = await User.findById(req.user.sub).select("-password")

  if (!user) {
    return res.status(404).json({
      message: "User not found"
    })
  }

  const { email, roles, _id, firstname, lastname } = user as IUSER

  res.status(200).json({
    message: "ok",
    data: { id: _id, email, firstname, lastname, roles }
  })
}

export const updateMyProfile = async (req: AUthRequest, res: Response) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" })
  }
  try {
    const { email, firstname, lastname, currentPassword, newPassword } = req.body as {
      email?: string
      firstname?: string
      lastname?: string
      currentPassword?: string
      newPassword?: string
    }
    const user = await User.findById(req.user.sub)
    if (!user) {
      return res.status(404).json({ message: "User not found" })
    }
    if (email) user.email = email
    if (firstname) (user as any).firstname = firstname
    if (lastname) (user as any).lastname = lastname

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ message: "Current password is required" })
      }
      const matches = await bcrypt.compare(currentPassword, user.password)
      if (!matches) {
        return res.status(400).json({ message: "Current password is incorrect" })
      }
      if (newPassword.length < 8) {
        return res
          .status(400)
          .json({ message: "New password must be at least 8 characters" })
      }
      user.password = await bcrypt.hash(newPassword, 10)
    }
    await user.save()
    const { roles, _id, firstname: savedFirstName, lastname: savedLastName } = user as IUSER
    return res.status(200).json({
      message: "updated",
      data: {
        id: _id,
        email: user.email,
        firstname: savedFirstName,
        lastname: savedLastName,
        roles
      }
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ message: "Internal server error" })
  }
}

export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { token } = req.body
    if (!token) {
      return res.status(400).json({ message: "Token required" })
    }

    const payload = jwt.verify(token, JWT_REFRESH_SECRET) as jwt.JwtPayload & {
      sub: string
    }
    const user = await User.findById(payload.sub)
    if (!user) {
      return res.status(403).json({ message: "Invalid refresh token" })
    }
    const accessToken = signAccessToken(user)

    res.status(200).json({
      accessToken
    })
  } catch (err) {
    console.error(err)
    res.status(403).json({ message: "Invalid or expire token" })
  }
}

export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body as { email?: string }

    if (!email) {
      return res.status(400).json({ message: "Email is required" })
    }

    const user = await User.findOne({ email })

    if (!user) {
      // Respond with success to prevent email enumeration
      return res.status(200).json({
        message: "If an account exists for this email, an OTP has been sent."
      })
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString()

    // Hash OTP and set to resetPasswordToken field
    user.resetPasswordToken = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex")

    // Set expiration to 10 minutes
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000)

    await user.save()

    const subject = "Password Reset OTP"
    const text = `Your password reset OTP is: ${otp}. It expires in 10 minutes.`
    const html = `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
        <h2 style="color: #6d28d9;">Password Reset Request</h2>
        <p>You requested a password reset. Use the OTP below to proceed:</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <h1 style="letter-spacing: 5px; color: #6d28d9; margin: 0;">${otp}</h1>
        </div>
        <p>This OTP expires in 10 minutes.</p>
        <p style="font-size: 12px; color: #666;">If you didn't request this, please ignore this email.</p>
      </div>
    `

    // Send email asynchronously but don't wait for it to block response if not critical
    // or wait to ensure delivery. Here we wait.
    try {
      await sendEmail(email, subject, text, html);
    } catch (emailError) {
      console.error("Failed to send email", emailError)
      // Optionally return error or just log. 
      // Returning success to avoid enumeration might be preferred, but if email fails, user can't reset.
      // Let's assume on failure we tell user (since we already checked user existence implies found)
      // But for security, we'll keep generic or 500.
    }

    // Still log for dev purposes if no SMTP
    // console.log("----------------------------------------------------")
    // console.log(`Simulated Email Sent to: ${email}`)
    // console.log(`OTP Code: ${otp}`)
    // console.log("----------------------------------------------------")

    return res.status(200).json({
      message: "If an account exists for this email, an OTP has been sent."
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Internal server error" })
  }
}
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { email, otp } = req.body

    if (!email || !otp) {
      return res.status(400).json({ message: "Email and OTP are required" })
    }

    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex")

    const user = await User.findOne({
      email,
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() }
    })

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" })
    }

    return res.status(200).json({
      message: "OTP verified successfully"
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Internal server error" })
  }
}
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const { email, otp, password } = req.body

    if (!email || !otp || !password) {
      return res.status(400).json({ message: "Email, OTP, and password are required" })
    }

    // Hash the provided OTP to compare
    const resetPasswordToken = crypto
      .createHash("sha256")
      .update(otp)
      .digest("hex")

    const user = await User.findOne({
      email,
      resetPasswordToken,
      resetPasswordExpires: { $gt: Date.now() }
    })

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired OTP" })
    }

    // Update password
    user.password = await bcrypt.hash(password, 10)

    // Clear reset token fields
    user.resetPasswordToken = undefined
    user.resetPasswordExpires = undefined

    await user.save()

    return res.status(200).json({
      message: "Password updated successfully"
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ message: "Internal server error" })
  }
}
