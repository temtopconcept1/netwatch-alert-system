// routes.js — REST API for the Administration Dashboard Module (Section 3.6.3 / 4.4)

const express = require("express");
const db = require("./db");
const { scheduleDevice, clearDeviceSchedule, pollDevice } = require("./monitor");
const { dispatchAlert } = require("./notifier");

const router = express.Router();

// ---------- Dashboard summary ----------
router.get("/summary", (req, res) => {
  const devices = db.prepare("SELECT * FROM devices WHERE active = 1").all();
  const up = devices.filter((d) => d.status === "UP").length;
  const down = devices.filter((d) => d.status === "DOWN").length;
  const unknown = devices.filter((d) => d.status === "UNKNOWN").length;
  const openAlerts = db.prepare("SELECT COUNT(*) c FROM alerts WHERE resolved_at IS NULL").get().c;
  const totalAlerts = db.prepare("SELECT COUNT(*) c FROM alerts").get().c;
  const notificationsSent = db.prepare("SELECT COUNT(*) c FROM notification_logs").get().c;
  res.json({ totalDevices: devices.length, up, down, unknown, openAlerts, totalAlerts, notificationsSent });
});

// ---------- Devices ----------
router.get("/devices", (req, res) => {
  res.json(db.prepare("SELECT * FROM devices WHERE active = 1 ORDER BY device_id").all());
});

router.post("/devices", (req, res) => {
  const { name, target, check_method, polling_interval, fail_threshold } = req.body;
  if (!name || !target) return res.status(400).json({ error: "name and target are required" });

  const info = db
    .prepare(
      `INSERT INTO devices (name, target, check_method, polling_interval, fail_threshold)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      name,
      target,
      check_method === "http" ? "http" : "tcp",
      Number(polling_interval) || 15,
      Number(fail_threshold) || 3
    );

  const device = db.prepare("SELECT * FROM devices WHERE device_id = ?").get(info.lastInsertRowid);
  scheduleDevice(device);
  res.status(201).json(device);
});

router.delete("/devices/:id", (req, res) => {
  const id = Number(req.params.id);
  clearDeviceSchedule(id);
  db.prepare("UPDATE devices SET active = 0 WHERE device_id = ?").run(id);
  res.status(204).end();
});

router.post("/devices/:id/check-now", async (req, res) => {
  const id = Number(req.params.id);
  await pollDevice(id);
  const device = db.prepare("SELECT * FROM devices WHERE device_id = ?").get(id);
  res.json(device);
});

// ---------- Administrators ----------
router.get("/administrators", (req, res) => {
  res.json(db.prepare("SELECT * FROM administrators ORDER BY admin_id").all());
});

router.post("/administrators", (req, res) => {
  const { full_name, email, phone_number, role, notify_email, notify_sms } = req.body;
  if (!full_name) return res.status(400).json({ error: "full_name is required" });
  const info = db
    .prepare(
      `INSERT INTO administrators (full_name, email, phone_number, role, notify_email, notify_sms)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      full_name,
      email || null,
      phone_number || null,
      role || "Administrator",
      notify_email === false ? 0 : 1,
      notify_sms === false ? 0 : 1
    );
  res.status(201).json(db.prepare("SELECT * FROM administrators WHERE admin_id = ?").get(info.lastInsertRowid));
});

router.delete("/administrators/:id", (req, res) => {
  db.prepare("DELETE FROM administrators WHERE admin_id = ?").run(Number(req.params.id));
  res.status(204).end();
});

// ---------- Alerts ----------
router.get("/alerts", (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.*, d.name AS device_name, d.target AS device_target
       FROM alerts a JOIN devices d ON d.device_id = a.device_id
       ORDER BY a.triggered_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

// ---------- Notification logs ----------
router.get("/notifications", (req, res) => {
  const rows = db
    .prepare(
      `SELECT n.*, a.description AS alert_description, d.name AS device_name
       FROM notification_logs n
       JOIN alerts a ON a.alert_id = n.alert_id
       JOIN devices d ON d.device_id = a.device_id
       ORDER BY n.sent_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

// ---------- Manual test alert (exercises the full alert -> notification pipeline) ----------
router.post("/test-alert", async (req, res) => {
  const device = db.prepare("SELECT * FROM devices WHERE active = 1 LIMIT 1").get();
  if (!device) return res.status(400).json({ error: "Register at least one device first" });

  const description = `Manually triggered test alert for "${device.name}" to verify the notification pipeline.`;
  const info = db
    .prepare(`INSERT INTO alerts (device_id, severity, description) VALUES (?, 'TEST', ?)`)
    .run(device.device_id, description);
  const alert = db.prepare("SELECT * FROM alerts WHERE alert_id = ?").get(info.lastInsertRowid);

  await dispatchAlert(alert, device);
  res.json({ ok: true, alert });
});

// ---------- Check history for a device (for simple sparkline / table) ----------
router.get("/devices/:id/history", (req, res) => {
  const id = Number(req.params.id);
  const rows = db
    .prepare(`SELECT * FROM check_history WHERE device_id = ? ORDER BY checked_at DESC LIMIT 50`)
    .all(id);
  res.json(rows);
});

module.exports = router;
