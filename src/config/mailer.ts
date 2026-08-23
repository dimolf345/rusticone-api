import nodemailer, { type Transporter } from "nodemailer";

import type { IMailTransporter } from "../interfaces/email/index.js";
import { logger } from "../logger/index.js";

let transporter: Transporter | undefined;

/**
 * Reports whether the minimum SMTP configuration is present. Callers use this to
 * skip email dispatch cleanly in environments (tests, local dev) where SMTP is
 * intentionally not wired up.
 */
export function isMailerConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

/**
 * Returns a lazily-initialized, reusable Nodemailer transporter built from the
 * SMTP environment variables. The transport is created once and cached; creating
 * it does not open a network connection.
 */
export function getMailer(): IMailTransporter {
  if (transporter) {
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    // Port 465 uses implicit TLS; everything else negotiates STARTTLS.
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  return transporter;
}

/**
 * Verifies the SMTP connection so configuration problems surface at startup
 * instead of on the first quote. Never throws: failures are logged and reported
 * via the boolean return so a mail outage cannot prevent the server booting.
 */
export async function verifyMailer(): Promise<boolean> {
  if (!isMailerConfigured()) {
    logger.warn("SMTP is not configured; quote notification emails are disabled");
    return false;
  }

  try {
    await getMailer().verify();
    logger.info("SMTP connection verified");
    return true;
  } catch (error) {
    logger.error({ err: error }, "SMTP connection verification failed");
    return false;
  }
}

/** Clears the cached transporter. Intended for tests and graceful shutdown. */
export function resetMailer(): void {
  transporter = undefined;
}
