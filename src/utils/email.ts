import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT) : 587;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || '"DevSphere" <no-reply@devsphere.com>';

const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
    },
});

export const sendEmail = async (to: string, subject: string, text: string, html?: string) => {
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        console.warn("SMTP credentials not provided. Email not sent.");
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: SMTP_FROM,
            to,
            subject,
            text,
            html: html || text,
        });
        console.log("Message sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};
