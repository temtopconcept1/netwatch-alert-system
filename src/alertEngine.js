// alertEngine.js — Alert-Evaluation Engine
// Applies the consecutive-failure threshold rule described in Section 3.6.1 and the
// Chapter Four flowchart: raises a fault event once a device's consecutive failure
// count meets its configured threshold, and auto-resolves the alert on recovery.

const db = require("./db");
const { dispatchAlert } = require("./notifier");

async function evaluateCheckResult(device, result) {
  if (result.success) {
    const wasDown = device.status === "DOWN";
    db.prepare(
      `UPDATE devices SET status = 'UP', consecutive_fails = 0 WHERE device_id = ?`
    ).run(device.device_id);

    if (wasDown) {
      // auto-resolve the most recent open alert for this device
      const openAlert = db
        .prepare(
          `SELECT * FROM alerts WHERE device_id = ? AND resolved_at IS NULL ORDER BY triggered_at DESC LIMIT 1`
        )
        .get(device.device_id);
      if (openAlert) {
        db.prepare(`UPDATE alerts SET resolved_at = datetime('now') WHERE alert_id = ?`).run(
          openAlert.alert_id
        );
      }
    }
    return;
  }

  // failure branch
  const newFailCount = device.consecutive_fails + 1;

  if (newFailCount < device.fail_threshold) {
    db.prepare(`UPDATE devices SET consecutive_fails = ? WHERE device_id = ?`).run(
      newFailCount,
      device.device_id
    );
    return; // threshold not yet breached — no alert (avoids false alarms from transient blips)
  }

  // threshold breached
  db.prepare(
    `UPDATE devices SET status = 'DOWN', consecutive_fails = ? WHERE device_id = ?`
  ).run(newFailCount, device.device_id);

  // only raise a new alert if one isn't already open for this device
  const existingOpen = db
    .prepare(`SELECT * FROM alerts WHERE device_id = ? AND resolved_at IS NULL`)
    .get(device.device_id);

  if (!existingOpen) {
    const description = `Device "${device.name}" (${device.target}) has failed ${newFailCount} consecutive checks. Last error: ${result.detail}`;
    const info = db
      .prepare(
        `INSERT INTO alerts (device_id, severity, description) VALUES (?, 'CRITICAL', ?)`
      )
      .run(device.device_id, description);

    const alert = db.prepare(`SELECT * FROM alerts WHERE alert_id = ?`).get(info.lastInsertRowid);
    await dispatchAlert(alert, device);
  }
}

module.exports = { evaluateCheckResult };
