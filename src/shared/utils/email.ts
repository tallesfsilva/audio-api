import { config } from "@/config";
import nodemailer, { Transporter } from "nodemailer";
import validator from 'validator';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: Number(config.SMTP_PORT ?? 587),
    secure: false, 
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });

  return transporter;
}


// src/utils/validateEmail.ts


export function validateEmail(email: unknown): email is string {
  if (typeof email !== 'string') return false;
  if (email.length > 254) return false;
  return validator.isEmail(email);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
export async function sendEmailAccountCreation(email: string, token: string) {
const link = `${config.APP_URL}/api/v1/auth/verify?token=${token}`;

        const mailer = getTransporter();

  await mailer.sendMail({
    from: config.SUPPORT_INBOX_EMAIL,
    to: email,
    subject: "Activate your Subcult account!",
   html: `
            <!DOCTYPE html>
            <html lang="en">
            <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Activate your account</title>
            </head>

            <body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;">

            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f7;padding:40px 20px;">
            <tr>
            <td align="center">

            <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">

            <tr>
            <td style="background:#111827;padding:32px;text-align:center;">
            <h1 style="margin:0;color:#ffffff;font-size:30px;font-weight:700;">
            🎬 Subcult
            </h1>
            </td>
            </tr>

            <tr>
            <td style="padding:48px 40px;">

            <h2 style="margin:0 0 20px;font-size:28px;font-weight:700;color:#111827;">
            Welcome!
            </h2>

            <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#4b5563;">
            Thanks for creating your Subcult account.
            </p>

            <p style="margin:0 0 32px;font-size:16px;line-height:1.7;color:#4b5563;">
            Click the button below to verify your email address and activate your account.
            </p>

            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:32px auto;">
            <tr>
            <td align="center" bgcolor="#6D28D9" style="border-radius:8px;">
            <a
            href="${link}"
            style="
            display:inline-block;
            padding:16px 34px;
            font-size:16px;
            font-weight:600;
            color:#ffffff;
            text-decoration:none;
            ">
            Activate Account
            </a>
            </td>
            </tr>
            </table>

            <p style="margin:32px 0 12px;font-size:14px;color:#6b7280;">
            Or copy and paste this link into your browser:
            </p>

            <p style="word-break:break-all;font-size:14px;color:#2563eb;">
            <a href="${link}" style="color:#2563eb;text-decoration:none;">
            ${link}
            </a>
            </p>

            <hr style="margin:40px 0;border:none;border-top:1px solid #e5e7eb;">

            <p style="margin:0;font-size:14px;line-height:1.7;color:#6b7280;">
            This activation link expires in <strong>24 hours</strong>.
            </p>

            <p style="margin:20px 0 0;font-size:14px;line-height:1.7;color:#6b7280;">
            If you didn't create a Subcult account, you can safely ignore this email.
            </p>

            </td>
            </tr>

            <tr>
            <td style="background:#f9fafb;padding:24px;text-align:center;border-top:1px solid #e5e7eb;">

            <p style="margin:0;font-size:13px;color:#9ca3af;">
            © ${new Date().getFullYear()} Subcult. All rights reserved.
            </p>

            </td>
            </tr>

            </table>

            </td>
            </tr>
            </table>

            </body>
            </html>
                `,
  });

}
