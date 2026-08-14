import nodemailer from "nodemailer";
import { env } from "../config/env";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    if (!env.sendEmails || !env.email.host) {
      // SEND_EMAILS=false, or no EMAIL_HOST configured (e.g. local dev
      // without access to the internal relay). Fall back to a JSON
      // transport so the app keeps working and emails are logged instead
      // of silently failing or erroring out.
      transporter = nodemailer.createTransport({ jsonTransport: true });
    } else {
      transporter = nodemailer.createTransport({
        host: env.email.host,
        port: env.email.port,
        secure: env.email.secure,
        ignoreTLS: env.email.ignoreTls,
        auth: env.email.user ? { user: env.email.user, pass: env.email.pass } : undefined,
        tls: { rejectUnauthorized: env.email.rejectUnauthorizedTls },
      });
    }
  }
  return transporter;
}

/**
 * TLS certificate failures against an internal relay are the single most
 * common email misconfiguration for this app (self-signed or expired
 * certs are normal on an internal-only relay). Rather than surfacing just
 * nodemailer's bare "certificate has expired"/"self signed certificate"
 * message, append the exact fix so it's impossible to miss wherever this
 * error is logged or shown.
 */
function describeEmailError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err);
  const code = (err as { code?: string } | undefined)?.code;
  const isTlsCertError = code === "ESOCKET" || /certificate|self.signed|SSL|TLS/i.test(message);
  if (!isTlsCertError) {
    return err instanceof Error ? err : new Error(message);
  }
  const guidance = env.email.rejectUnauthorizedTls
    ? `set EMAIL_TLS_REJECT_UNAUTHORIZED=false in your .env file (NOT .env.example - that file is never read at runtime, only .env is) and restart/re-run.`
    : `EMAIL_TLS_REJECT_UNAUTHORIZED is already set to false, so this is a different TLS problem, not a certificate-trust issue. Double-check EMAIL_HOST/EMAIL_PORT are correct and the relay is reachable from this machine.`;
  return new Error(
    `${message} - this looks like a TLS certificate problem talking to EMAIL_HOST="${env.email.host}". ` +
      `If this is an internal-only mail relay with a self-signed or expired certificate, ${guidance} ` +
      `If the relay doesn't use STARTTLS at all, set EMAIL_IGNORE_TLS=true instead.`,
    { cause: err instanceof Error ? err : undefined }
  );
}

async function send(to: string, subject: string, html: string) {
  // In non-production environments, TEST_EMAIL_USER (if set) captures all
  // outgoing mail so test runs never reach real employee inboxes.
  const recipient = !env.isProduction && env.testEmailUser ? env.testEmailUser : to;
  let info: Awaited<ReturnType<nodemailer.Transporter["sendMail"]>>;
  try {
    info = await getTransporter().sendMail({
      from: env.email.sender,
      to: recipient,
      subject: recipient === to ? subject : `[to: ${to}] ${subject}`,
      html,
    });
  } catch (err) {
    throw describeEmailError(err);
  }
  if (!env.sendEmails || !env.email.host) {
    // eslint-disable-next-line no-console
    console.log(`[email:dev-mode] to=${recipient} subject="${subject}"`, info.message?.toString());
  }
  return info;
}

export async function sendSupervisorWelcomeEmail(params: {
  to: string;
  userId: string;
  tempPassword: string;
}) {
  const loginUrl = `${env.appBaseUrl}/login`;
  await send(
    params.to,
    "Welcome to TimeClockPlus - Your Account Details",
    `
      <p>An account has been created for you in TimeClockPlus.</p>
      <p><strong>User ID:</strong> ${params.userId}</p>
      <p><strong>Temporary Password:</strong> ${params.tempPassword}</p>
      <p><a href="${loginUrl}">Log in here</a></p>
      <p>You will be required to change your password on first login. This temporary
      password will expire after ${env.tempPasswordExpiryHours} hours.</p>
    `
  );
}

export async function sendInitialAdminEmail(params: { to: string; userId: string; tempPassword: string }) {
  const loginUrl = `${env.appBaseUrl}/login`;
  await send(
    params.to,
    "TimeClockPlus - Administrator Account Created",
    `
      <p>Your TimeClockPlus Administrator account has been created.</p>
      <p><strong>User ID:</strong> ${params.userId}</p>
      <p><strong>Temporary Password:</strong> ${params.tempPassword}</p>
      <p><a href="${loginUrl}">Log in here</a></p>
      <p>You will be required to change your password on first login.</p>
    `
  );
}

export async function sendPasswordResetCodeEmail(params: { to: string; code: string }) {
  await send(
    params.to,
    "TimeClockPlus - Password Reset Code",
    `
      <p>Your one-time password reset code is:</p>
      <h2>${params.code}</h2>
      <p>This code expires in ${env.passwordResetCodeExpiryMinutes} minutes and can only be used once.</p>
      <p>If you did not request this, you can safely ignore this email.</p>
    `
  );
}

export async function sendAdminPasswordResetEmail(params: { to: string; userId: string; tempPassword: string }) {
  const loginUrl = `${env.appBaseUrl}/login`;
  await send(
    params.to,
    "TimeClockPlus - Your Password Was Reset",
    `
      <p>An administrator has reset your TimeClockPlus password.</p>
      <p><strong>User ID:</strong> ${params.userId}</p>
      <p><strong>Temporary Password:</strong> ${params.tempPassword}</p>
      <p><a href="${loginUrl}">Log in here</a></p>
      <p>You will be required to change your password on first login. This temporary
      password will expire after ${env.tempPasswordExpiryHours} hours. If you did not
      expect this, contact your administrator.</p>
    `
  );
}

export async function sendForgotUsernameEmail(params: { to: string; userId: string }) {
  await send(
    params.to,
    "TimeClockPlus - Your User ID",
    `
      <p>You requested your TimeClockPlus User ID.</p>
      <p><strong>User ID:</strong> ${params.userId}</p>
    `
  );
}
