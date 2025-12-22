import { NextFunction, Request, Response } from "express"
import jwt from "jsonwebtoken"
import dotenv from "dotenv"
import { Role } from "../models/user.model"
dotenv.config()

const rawSecret = process.env.JWT_SECRET
const JWT_SECRET = rawSecret ? rawSecret.trim() : ""

export interface AuthPayload {
  sub: string
  roles?: Role[]
  iat?: number
  exp?: number
}

export interface AUthRequest extends Request {
  user?: AuthPayload
}

export const authenticate = (
  req: AUthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" })
  }
  // Bearer dgcfhvgjygukhiluytkuy
  const token = authHeader.split(" ")[1] // ["Bearer", "dgcfhvgjygukhiluytkuy"]

  if (!JWT_SECRET) {
    return res.status(500).json({ message: "JWT secret not configured" })
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as AuthPayload
    //  {
    //   sub: user._id.toString(),
    //   roles: user.roles
    // }
    req.user = payload
    next()
  } catch (err) {
    const e = err as jwt.VerifyErrors | Error
    if (e.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Token expired", code: "TOKEN_EXPIRED" })
    }
    if (e.name === "JsonWebTokenError" && (e as jwt.JsonWebTokenError).message === "invalid signature") {
      return res.status(401).json({ message: "Invalid signature", code: "TOKEN_BAD_SIGNATURE" })
    }
    console.error(err)
    return res.status(401).json({ message: "Invalid token", code: "TOKEN_INVALID" })
  }
}
// res, next - return
