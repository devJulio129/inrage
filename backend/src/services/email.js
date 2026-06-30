import net from 'node:net';
import tls from 'node:tls';

const DEFAULT_RESET_MESSAGE = 'Si tu no solicitaste esto, ignora este correo.';
const EMAIL_NOT_CONFIGURED = 'Email provider not configured';
const EMAIL_REJECTED = 'Email provider rejected message';

function emailError(message, status, code, provider = null) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  err.provider = provider;
  return err;
}

function hasResendConfig() {
  return Boolean(process.env.RESEND_API_KEY);
}

function hasSmtpConfig() {
  return Boolean(process.env.SMTP_HOST && (process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER));
}

function providerConfigured() {
  return hasResendConfig() || hasSmtpConfig();
}

function resetEmailText({ name, tempPassword, resetUrl, expiresMinutes }) {
  return [
    `Hola ${name || 'atleta'},`,
    '',
    'Recibimos una solicitud para restablecer tu contrasena de InRage.',
    `Tu contrasena provisional es: ${tempPassword}`,
    `Abre este link para crear una nueva contrasena: ${resetUrl}`,
    `Este acceso expira en ${expiresMinutes} minutos.`,
    DEFAULT_RESET_MESSAGE
  ].join('\n');
}

function resetEmailHtml({ name, tempPassword, resetUrl, expiresMinutes }) {
  return `
    <p>Hola ${name || 'atleta'},</p>
    <p>Recibimos una solicitud para restablecer tu contrasena de InRage.</p>
    <p><strong>Tu contrasena provisional es:</strong> ${tempPassword}</p>
    <p><a href="${resetUrl}">Crear una nueva contrasena</a></p>
    <p>Este acceso expira en ${expiresMinutes} minutos.</p>
    <p>${DEFAULT_RESET_MESSAGE}</p>
  `;
}

async function sendWithResend({ to, subject, text, html }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || 'InRage <no-reply@inrage.app>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, text, html })
  });
  if (!response.ok) {
    console.error('[email] Resend rejected message', { status: response.status, to });
    throw emailError(EMAIL_REJECTED, 502, 'EMAIL_PROVIDER_REJECTED', 'resend');
  }
  return { sent: true, provider: 'resend' };
}

async function sendWithSmtp({ to, subject, text, html }) {
  if (!hasSmtpConfig()) return null;
  const port = Number(process.env.SMTP_PORT || 587);
  const from = process.env.SMTP_FROM || process.env.EMAIL_FROM || process.env.SMTP_USER;
  try {
    await sendRawSmtp({
      host: process.env.SMTP_HOST,
      port,
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
      from,
      to,
      subject,
      text,
      html
    });
  } catch (err) {
    console.error('[email] SMTP rejected message', { host: process.env.SMTP_HOST, port, to, error: err.message });
    throw emailError(EMAIL_REJECTED, 502, 'EMAIL_PROVIDER_REJECTED', 'smtp');
  }
  return { sent: true, provider: 'smtp' };
}

function readLine(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    function cleanup() {
      socket.off('data', onData);
      socket.off('error', onError);
    }
    function onError(err) {
      cleanup();
      reject(err);
    }
    function onData(chunk) {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (lines.length === 0) return;
      const last = lines[lines.length - 1];
      if (/^\d{3}\s/.test(last)) {
        cleanup();
        resolve(buffer);
      }
    }
    socket.on('data', onData);
    socket.on('error', onError);
  });
}

async function command(socket, line, expected, { sensitive = false } = {}) {
  socket.write(`${line}\r\n`);
  const response = await readLine(socket);
  const code = Number(response.slice(0, 3));
  const ok = Array.isArray(expected) ? expected.includes(code) : code === expected;
  if (!ok) throw new Error(`SMTP command failed (${sensitive ? '[redacted]' : line}): ${response.trim()}`);
  return response;
}

function connectSmtp({ host, port }) {
  return new Promise((resolve, reject) => {
    const socket = port === 465
      ? tls.connect({ host, port, servername: host }, () => resolve(socket))
      : net.connect({ host, port }, () => resolve(socket));
    socket.setTimeout(15000);
    socket.once('error', reject);
    socket.once('timeout', () => reject(new Error('SMTP connection timed out')));
  });
}

function upgradeTls(socket, host) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: host }, () => resolve(secure));
    secure.once('error', reject);
  });
}

function smtpAddress(value) {
  const match = String(value || '').match(/<([^>]+)>/);
  return (match ? match[1] : value || '').trim();
}

function dotEscape(value) {
  return String(value || '').replace(/\r?\n\./g, '\n..');
}

function buildMessage({ from, to, subject, text, html }) {
  const boundary = `inrage-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    dotEscape(text),
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    dotEscape(html),
    `--${boundary}--`
  ].join('\r\n');
}

async function sendRawSmtp({ host, port, user, pass, from, to, subject, text, html }) {
  let socket = await connectSmtp({ host, port });
  await readLine(socket);
  await command(socket, `EHLO ${process.env.SMTP_EHLO_HOST || 'inrage.local'}`, 250);
  if (port !== 465) {
    await command(socket, 'STARTTLS', 220);
    socket = await upgradeTls(socket, host);
    await command(socket, `EHLO ${process.env.SMTP_EHLO_HOST || 'inrage.local'}`, 250);
  }
  if (user && pass) {
    await command(socket, 'AUTH LOGIN', 334);
    await command(socket, Buffer.from(user).toString('base64'), 334, { sensitive: true });
    await command(socket, Buffer.from(pass).toString('base64'), 235, { sensitive: true });
  }
  await command(socket, `MAIL FROM:<${smtpAddress(from)}>`, 250);
  await command(socket, `RCPT TO:<${smtpAddress(to)}>`, [250, 251]);
  await command(socket, 'DATA', 354);
  socket.write(`${buildMessage({ from, to, subject, text, html })}\r\n.\r\n`);
  await readLine(socket);
  await command(socket, 'QUIT', 221).catch(() => {});
  socket.end();
}

async function sendMail({ to, subject, text, html }) {
  if (!providerConfigured()) {
    throw emailError(EMAIL_NOT_CONFIGURED, 503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
  }

  const resend = await sendWithResend({ to, subject, text, html });
  if (resend) return resend;

  const smtp = await sendWithSmtp({ to, subject, text, html });
  if (smtp) return smtp;

  throw emailError(EMAIL_NOT_CONFIGURED, 503, 'EMAIL_PROVIDER_NOT_CONFIGURED');
}

export const emailService = {
  isConfigured: providerConfigured,

  async sendPasswordResetEmail({ to, name, tempPassword, resetUrl, expiresMinutes = 60 }) {
    const subject = 'Restablece tu contrasena de InRage';
    const text = resetEmailText({ name, tempPassword, resetUrl, expiresMinutes });
    const html = resetEmailHtml({ name, tempPassword, resetUrl, expiresMinutes });

    return sendMail({ to, subject, text, html });
  },

  async sendTestEmail({ to, name }) {
    const subject = 'InRage test email';
    const text = [
      `Hola ${name || 'admin'},`,
      '',
      'Este es un correo de prueba de InRage.',
      'Si lo recibiste, el proveedor de email esta funcionando.'
    ].join('\n');
    const html = `
      <p>Hola ${name || 'admin'},</p>
      <p>Este es un correo de prueba de InRage.</p>
      <p>Si lo recibiste, el proveedor de email esta funcionando.</p>
    `;
    return sendMail({ to, subject, text, html });
  }
};
