import { logger } from '@librechat/data-schemas';
import { checkEmailConfig, isEnabled } from '~/utils';

type ManagerReviewEmail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailOptions = {
  from: string;
  to: string;
  envelope: {
    from: string;
    to: string;
  };
  subject: string;
  text: string;
  html: string;
};

type SmtpTransportOptions = {
  secure: boolean;
  requireTls: boolean;
  tls: {
    rejectUnauthorized: boolean;
    servername?: string;
  };
  auth?: {
    user: string;
    pass: string;
  };
  service?: string;
  host?: string;
  port?: string | number;
};

type NodemailerTransport = {
  sendMail(mailOptions: MailOptions): Promise<unknown>;
};

type NodemailerModule = {
  createTransport(options: SmtpTransportOptions): NodemailerTransport;
};

export type ManagerReviewEmailSendResult = {
  mode: 'disabled' | 'smtp';
  sent: boolean;
  reason?: string;
};

const nodemailer = require('nodemailer') as NodemailerModule;

function getFromAddress() {
  const fromName = process.env.EMAIL_FROM_NAME || process.env.APP_TITLE || 'HumLibreChat';
  const fromEmail = process.env.EMAIL_FROM ?? '';
  return {
    fromEmail,
    fromAddress: `"${fromName}" <${fromEmail}>`,
  };
}

function createSmtpTransportOptions(): SmtpTransportOptions {
  const options: SmtpTransportOptions = {
    secure: process.env.EMAIL_ENCRYPTION === 'tls',
    requireTls: process.env.EMAIL_ENCRYPTION === 'starttls',
    tls: {
      rejectUnauthorized: !isEnabled(process.env.EMAIL_ALLOW_SELFSIGNED),
    },
  };
  const hasUsername = !!process.env.EMAIL_USERNAME;
  const hasPassword = !!process.env.EMAIL_PASSWORD;

  if (hasUsername && hasPassword) {
    options.auth = {
      user: process.env.EMAIL_USERNAME ?? '',
      pass: process.env.EMAIL_PASSWORD ?? '',
    };
  } else if (hasUsername !== hasPassword) {
    logger.warn(
      '[sendManagerReviewEmail] EMAIL_USERNAME and EMAIL_PASSWORD must both be set for authenticated SMTP, or both omitted for unauthenticated SMTP. Proceeding without authentication.',
    );
  }

  if (process.env.EMAIL_ENCRYPTION_HOSTNAME) {
    options.tls.servername = process.env.EMAIL_ENCRYPTION_HOSTNAME;
  }

  if (process.env.EMAIL_SERVICE) {
    options.service = process.env.EMAIL_SERVICE;
    return options;
  }

  options.host = process.env.EMAIL_HOST;
  options.port = process.env.EMAIL_PORT ?? 25;
  return options;
}

export async function sendManagerReviewEmail(
  email: ManagerReviewEmail,
): Promise<ManagerReviewEmailSendResult> {
  const mode = process.env.MANAGER_REVIEW_EMAIL_MODE?.toLowerCase();
  if (mode !== 'smtp') {
    return {
      mode: 'disabled',
      sent: false,
      reason: 'MANAGER_REVIEW_EMAIL_MODE is not smtp',
    };
  }

  if (!checkEmailConfig()) {
    return {
      mode: 'disabled',
      sent: false,
      reason: 'Email configuration is incomplete',
    };
  }

  const { fromAddress, fromEmail } = getFromAddress();
  if (!fromEmail) {
    return {
      mode: 'disabled',
      sent: false,
      reason: 'EMAIL_FROM is not configured',
    };
  }

  const transporter = nodemailer.createTransport(createSmtpTransportOptions());
  await transporter.sendMail({
    from: fromAddress,
    to: email.to,
    envelope: {
      from: fromEmail,
      to: email.to,
    },
    subject: email.subject,
    text: email.text,
    html: email.html,
  });

  return {
    mode: 'smtp',
    sent: true,
  };
}
