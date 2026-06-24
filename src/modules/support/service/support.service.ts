// src/modules/upload/service/upload.service.ts

import { SupportContactPayload, SupportContactResult } from '../../../shared/types/domain';
import { config } from '../../../config';


import nodemailer, { Transporter } from "nodemailer";

import { supportTicketRepository } from '../repository/support.repository';


const ALLOWED_CATEGORIES = new Set([
  "billing",
  "feature",
  "bug",
  "other",
]);


function validatePayload(payload: Partial<SupportContactPayload>): string | null {
  if (!payload.subject || typeof payload.subject !== "string" || payload.subject.trim().length === 0) {
    return "subject is required";
  }
  if (payload.subject.length > 200) {
    return "subject must be 200 characters or fewer";
  }
  if (!payload.category || !ALLOWED_CATEGORIES.has(payload.category)) {
    return `category must be one of: ${[...ALLOWED_CATEGORIES].join(", ")}`;
  }
  if (!payload.message || typeof payload.message !== "string" || payload.message.trim().length === 0) {
    return "message is required";
  }
  if (payload.message.length > 5000) {
    return "message must be 5000 characters or fewer";
  }
  return null;
}

// ---------- Mail transport ----------

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

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendSupportNotificationEmail(params: {
  subject: string;
  category: string;
  message: string;
  userEmail?: string | null;
  ticketId: string;
}): Promise<void> {
  const mailer = getTransporter();
  const supportInbox = config.SUPPORT_INBOX_EMAIL;

  if (!supportInbox) {
    throw new Error("SUPPORT_INBOX_EMAIL env var is not configured");
  }

  await mailer.sendMail({
    from: supportInbox,
    to: supportInbox,
    replyTo: params.userEmail ?? undefined,
    subject: `[Support #${params.ticketId}] (${params.category}) ${params.subject}`,
    text: [
      `Ticket ID: ${params.ticketId}`,
      `Category: ${params.category}`,
      `From: ${params.userEmail ?? "unknown"}`,
      "",
      params.message,
    ].join("\n"),
    html: `
      <p><strong>Ticket ID:</strong> ${escapeHtml(params.ticketId)}</p>
      <p><strong>Category:</strong> ${escapeHtml(params.category)}</p>
      <p><strong>From:</strong> ${escapeHtml(params.userEmail ?? "unknown")}</p>
      <hr />
      <p>${escapeHtml(params.message).replace(/\n/g, "<br />")}</p>
    `,
  });
}

async function sendUserConfirmationEmail(params: {
  to: string;
  subject: string;
  ticketId: string;
}): Promise<void> {
  const mailer = getTransporter();

  await mailer.sendMail({
    from: config.SUPPORT_INBOX_EMAIL,
    to: params.to,
    subject: `We received your request (#${params.ticketId})`,
    text: `Thanks for reaching out about "${params.subject}". Our team will get back to you shortly. Reference: #${params.ticketId}.`,
    html: `<p>Thanks for reaching out about "<strong>${escapeHtml(
      params.subject
    )}</strong>". Our team will get back to you shortly.</p><p>Reference: <code>#${params.ticketId}</code></p>`,
  });
}
class SupportService {
  
  
  
 async createSupportTicket(
  payload: SupportContactPayload,
  context: { userId?: string; userEmail?: string }
): Promise<SupportContactResult> {

  const validationError = validatePayload(payload);
  if (validationError) {
    throw new Error(validationError);
  }

  const ticket = await supportTicketRepository.create({
    subject: payload.subject.trim(),
    category: payload.category,
    message: payload.message.trim(),
    userId: context.userId ?? null,
    userEmail: context.userEmail ?? null,
  });
  try {
    await sendSupportNotificationEmail({
      subject:payload.subject.trim(),
      category: payload.category,
      message: payload.message.trim(),
      userEmail: context.userEmail,
      ticketId: ticket.id
    });

    if (context.userEmail) {
      await sendUserConfirmationEmail({
        to: context.userEmail,
        subject: payload.subject.trim(),
        ticketId:ticket.id,
      });
    }
  } catch (emailError) {
    // Ticket is already persisted — don't fail the request just because email delivery failed.
    // Log for ops follow-up; consider a retry queue (BullMQ) for production reliability.
    console.error(`[support] Failed to send email for ticket ${ticket.id}:`, emailError);
  }

  return { ok: true };
}
 
}

export const uploadService = new SupportService();
