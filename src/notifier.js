// notifier.js — Notification-Dispatch Module
// Sends a raised alert to every administrator subscribed to email and/or SMS,
// through real providers (SMTP via Nodemailer, SMS via Twilio) when credentials
// are configured in the environment, and falls back to a logged "SIMULATED"
// delivery otherwise so the full pipeline can be demonstrated without live
// third-party credentials. Every attempt, real or simulated, is recorded in
// the NotificationLogs table (Section 3.6.2).

const db = require("./db");

let mailTransport = null;
function getMailTransport() {
  if (mailTransport) return mailTransport;
  if (!process.env.SMTP_HOST) return null;
  const nodemailer = require("nodemailer");
  mailTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  return mailTransport;
}

let twilioClient = null;
function getTwilioClient() {
  if (twilioClient) return twilioClient;
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  const twilio = require("twilio");
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return twilioClient;
}

function logNotification({ alert_id, admin_id, channel, recipient, delivery_status, detail }) {
  db.prepare(
    `INSERT INTO notification_logs (alert_id, admin_id, channel, recipient, delivery_status, detail)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(alert_id, admin_id, channel, recipient, delivery_status, detail);
}

async function sendEmail({ alert, admin, subject, body }) {
  const transport = getMailTransport();
  if (!transport) {
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "EMAIL",
      recipient: admin.email,
      delivery_status: "SIMULATED",
      detail: "No SMTP credentials configured — logged instead of sent. Set SMTP_HOST/USER/PASS in .env for live delivery.",
    });
    console.log(`[notifier] (simulated email) to=${admin.email} subject="${subject}"`);
    return;
  }
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || "alerts@network-monitor.local",
      to: admin.email,
      subject,
      text: body,
    });
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "EMAIL",
      recipient: admin.email,
      delivery_status: "SENT",
      detail: "Delivered via SMTP",
    });
  } catch (err) {
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "EMAIL",
      recipient: admin.email,
      delivery_status: "FAILED",
      detail: err.message,
    });
  }
}

async function sendSms({ alert, admin, body }) {
  const client = getTwilioClient();
  if (!client) {
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "SMS",
      recipient: admin.phone_number,
      delivery_status: "SIMULATED",
      detail: "No Twilio credentials configured — logged instead of sent. Set TWILIO_* vars in .env for live delivery.",
    });
    console.log(`[notifier] (simulated sms) to=${admin.phone_number} "${body}"`);
    return;
  }
  try {
    await client.messages.create({
      from: process.env.TWILIO_FROM_NUMBER,
      to: admin.phone_number,
      body,
    });
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "SMS",
      recipient: admin.phone_number,
      delivery_status: "SENT",
      detail: "Delivered via Twilio",
    });
  } catch (err) {
    logNotification({
      alert_id: alert.alert_id,
      admin_id: admin.admin_id,
      channel: "SMS",
      recipient: admin.phone_number,
      delivery_status: "FAILED",
      detail: err.message,
    });
  }
}

async function dispatchAlert(alert, device) {
  const admins = db.prepare("SELECT * FROM administrators").all();
  const subject = `[ALERT] ${device.name} is DOWN`;
  const body = `Cloud-Based Network Alert Notification System\n\nDevice: ${device.name} (${device.target})\nStatus: DOWN\nDetected: ${alert.triggered_at}\nDetails: ${alert.description}\n\nPlease investigate.`;

  const jobs = [];
  for (const admin of admins) {
    if (admin.notify_email && admin.email) {
      jobs.push(sendEmail({ alert, admin, subject, body }));
    }
    if (admin.notify_sms && admin.phone_number) {
      jobs.push(sendSms({ alert, admin, body: `${subject}: ${device.name} unreachable at ${alert.triggered_at}` }));
    }
  }
  await Promise.all(jobs);
}

module.exports = { dispatchAlert };
