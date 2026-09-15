# NetWatch — Cloud-Based Network Alert Notification System

A working implementation of the final-year project **"Development of a Cloud-Based
Network Alert Notification System."** It monitors registered devices/services,
detects faults using a consecutive-failure threshold rule, and dispatches
multi-channel (email + SMS) alerts to registered administrators — matching the
architecture and flowchart described in Chapters Three and Four of the project
write-up.

## What's implemented

| Write-up module (Ch. 3–4)         | Code |
|---|---|
| Monitoring/Polling Module          | `src/monitor.js` — TCP connect & HTTP(S) checks on a per-device interval |
| Alert-Evaluation Engine            | `src/alertEngine.js` — consecutive-failure threshold, auto-resolve on recovery |
| Notification-Dispatch Module       | `src/notifier.js` — email (Nodemailer/SMTP) + SMS (Twilio), with a simulated fallback |
| Administration Dashboard Module    | `public/` — live web dashboard (devices, alerts, notification log, admins) |
| Database (Devices, Administrators, Alerts, NotificationLogs) | `src/db.js` — SQLite via `better-sqlite3` |

## Quick start (local demo)

```bash
npm install
cp .env.example .env        # optional — leave blank to run in simulated mode
npm start                   # starts the server on http://localhost:3000
```

Open **http://localhost:3000** in a browser. Use **"+ Add device"** to register
something to monitor — for a quick local test you can point it at your own
machine, e.g. target `localhost:22` (TCP) or `https://example.com` (HTTP), set a
short polling interval (5–10s) and a low fail threshold (2), then add an
administrator with an email/phone so you can see alerts and notification-log
entries appear as devices go up/down.

### Simulating a fault to see the full pipeline fire
Two disposable demo services are included so you can watch a real detect →
alert → notify cycle without needing external infrastructure:

```bash
node demo/start-demo-targets.js     # starts two dummy services on :4001 and :4002
```
Register both as devices (`http://localhost:4001`, `http://localhost:4002`,
method HTTP). Then stop the demo script (Ctrl+C) or kill just one port to
simulate an outage — within one or two polling cycles the dashboard will show
the device as `DOWN`, an alert will appear in **Alert history**, and entries
will appear in the **Notification log**.

## Enabling real email/SMS delivery

By default (no credentials set) every alert is still fully detected and
logged, but notifications are recorded as `SIMULATED` instead of actually
being sent — this lets the whole pipeline be demonstrated without live
third-party accounts. To send real notifications, fill in `.env`:

```ini
SMTP_HOST=smtp.yourprovider.com
SMTP_PORT=587
SMTP_USER=you@yourdomain.com
SMTP_PASS=your-smtp-password
SMTP_FROM=alerts@yourdomain.com

TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM_NUMBER=+1xxxxxxxxxx
```
Restart the server after editing `.env`. No code changes are required —
`src/notifier.js` automatically switches from simulated to live delivery once
credentials are present.

## Deploying to the cloud (as described in Chapter Three)

The app is a standard Node.js/Express service and can be deployed to any
IaaS/PaaS provider (AWS EC2, Azure App Service, Render, Railway, a DigitalOcean
droplet, etc.):

1. Provision a small Linux VM/instance (1 vCPU / 2 GB RAM is enough — see
   Section 3.5.1 of the write-up).
2. Install Node.js LTS, clone/upload this project, run `npm install`.
3. Set the environment variables from `.env.example` (via the platform's
   environment/secrets settings rather than committing `.env`).
4. Run with a process manager, e.g. `pm2 start server.js` or a `systemd`
   service, so it restarts automatically and keeps polling continuously.
5. Point a domain/HTTPS reverse proxy (e.g. Nginx or the platform's built-in
   TLS) at port 3000 (or your configured `PORT`).

Because the monitoring, alert-evaluation, and notification logic all run on
this cloud-hosted service rather than on the network being monitored, the
alerting pipeline keeps working even if part of the monitored network itself
goes down — the core design goal from Chapter One.

## API reference (used by the dashboard, also usable directly)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/summary` | Dashboard summary counts |
| GET/POST | `/api/devices` | List / register monitored devices |
| DELETE | `/api/devices/:id` | Deactivate a device |
| POST | `/api/devices/:id/check-now` | Force an immediate check |
| GET/POST | `/api/administrators` | List / register administrators |
| DELETE | `/api/administrators/:id` | Remove an administrator |
| GET | `/api/alerts` | Alert history |
| GET | `/api/notifications` | Notification delivery log |
| POST | `/api/test-alert` | Manually fire a test alert through the full notification pipeline |

## Project structure

```
cnans/
  server.js              Express entry point
  src/
    db.js                SQLite schema & connection
    monitor.js            Polling engine (TCP/HTTP checks)
    alertEngine.js         Threshold evaluation + auto-resolve
    notifier.js             Email/SMS dispatch (+ simulated fallback)
    routes.js               REST API
  public/                 Dashboard front end (HTML/CSS/JS, no build step)
  demo/                   Disposable target services for local testing
  .env.example
```

## Notes & limitations (see Chapter One, Section 1.6 of the write-up)

- SNMP polling is not implemented in this version; checks are TCP-connect and
  HTTP(S)-based, which cover the majority of reachability/availability use
  cases described in the project scope. SNMP support can be added as a third
  `check_method` in `src/monitor.js` using a library such as `net-snmp`.
- SMS delivery depends on the response time of the configured third-party
  gateway (Twilio), consistent with the limitation noted in Section 4.6.
- The system currently supports one notification profile per administrator;
  escalation rules (Section 2.3.1) are a suggested future extension.
