// monitor.js — Monitoring/Polling Module
// Periodically probes each registered device/service using a TCP connect check
// or an HTTP(S) request, records the result, and hands off to the alert engine.
// Corresponds to Section 3.6.1 (Monitoring Layer) and the flowchart in Chapter Four.

const net = require("net");
const db = require("./db");
const { evaluateCheckResult } = require("./alertEngine");

const timers = new Map(); // device_id -> interval handle

function tcpCheck(target, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const [host, portStr] = target.split(":");
    const port = Number(portStr) || 80;
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (success, detail) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ success, responseMs: Date.now() - start, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true, "TCP connect succeeded"));
    socket.once("timeout", () => finish(false, "TCP connect timed out"));
    socket.once("error", (err) => finish(false, `TCP error: ${err.code || err.message}`));

    try {
      socket.connect(port, host);
    } catch (err) {
      finish(false, `TCP exception: ${err.message}`);
    }
  });
}

async function httpCheck(target, timeoutMs = 4000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(target, { signal: controller.signal, method: "GET" });
    clearTimeout(timer);
    const ok = res.status >= 200 && res.status < 500; // reachable even on 4xx; 5xx/timeouts are faults
    const success = res.status < 500;
    return {
      success,
      responseMs: Date.now() - start,
      detail: `HTTP ${res.status}`,
    };
  } catch (err) {
    clearTimeout(timer);
    return { success: false, responseMs: Date.now() - start, detail: `HTTP error: ${err.message}` };
  }
}

async function probeDevice(device) {
  if (device.check_method === "http") {
    return httpCheck(device.target);
  }
  return tcpCheck(device.target);
}

async function pollDevice(deviceId) {
  const device = db.prepare("SELECT * FROM devices WHERE device_id = ? AND active = 1").get(deviceId);
  if (!device) return;

  const result = await probeDevice(device);

  db.prepare(
    `INSERT INTO check_history (device_id, success, response_ms, detail) VALUES (?, ?, ?, ?)`
  ).run(device.device_id, result.success ? 1 : 0, result.responseMs, result.detail);

  db.prepare(
    `UPDATE devices SET last_checked_at = datetime('now'), last_response_ms = ? WHERE device_id = ?`
  ).run(result.responseMs, device.device_id);

  await evaluateCheckResult(device, result);
}

function scheduleDevice(device) {
  clearDeviceSchedule(device.device_id);
  const intervalMs = Math.max(5, device.polling_interval) * 1000;
  // run once immediately, then on the configured interval
  pollDevice(device.device_id).catch((e) => console.error("poll error", e));
  const handle = setInterval(() => {
    pollDevice(device.device_id).catch((e) => console.error("poll error", e));
  }, intervalMs);
  timers.set(device.device_id, handle);
}

function clearDeviceSchedule(deviceId) {
  if (timers.has(deviceId)) {
    clearInterval(timers.get(deviceId));
    timers.delete(deviceId);
  }
}

function startMonitoring() {
  const devices = db.prepare("SELECT * FROM devices WHERE active = 1").all();
  devices.forEach(scheduleDevice);
  console.log(`[monitor] scheduled polling for ${devices.length} device(s)`);
}

module.exports = {
  startMonitoring,
  scheduleDevice,
  clearDeviceSchedule,
  pollDevice,
  probeDevice,
};
