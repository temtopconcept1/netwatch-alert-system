const API = "/api";

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
function timeAgo(iso) {
  if (!iso) return "—";
  const d = new Date(iso.replace(" ", "T") + "Z");
  const diff = Math.round((Date.now() - d.getTime()) / 1000);
  if (diff < 5) return "just now";
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

async function api(path, opts) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  if (res.status === 204) return null;
  return res.json();
}

// ---------- clock ----------
setInterval(() => {
  document.getElementById("clock").textContent = new Date().toLocaleTimeString();
}, 1000);

// ---------- summary ----------
async function refreshSummary() {
  const s = await api("/summary");
  document.getElementById("statTotal").textContent = s.totalDevices;
  document.getElementById("statUp").textContent = s.up;
  document.getElementById("statDown").textContent = s.down;
  document.getElementById("statOpen").textContent = s.openAlerts;
  document.getElementById("statNotif").textContent = s.notificationsSent;
}

// ---------- devices ----------
async function refreshDevices() {
  const devices = await api("/devices");
  const body = document.getElementById("devicesBody");
  body.innerHTML = "";
  if (devices.length === 0) {
    body.appendChild(el("tr", null, `<td colspan="8" class="empty-row">No devices registered yet — add one above.</td>`));
    return;
  }
  devices.forEach((d) => {
    const statusClass = d.status === "UP" ? "status-up" : d.status === "DOWN" ? "status-down" : "status-unknown";
    const tr = el("tr");
    tr.innerHTML = `
      <td><span class="status-pill ${statusClass}">${d.status}</span></td>
      <td>${d.name}</td>
      <td class="mono">${d.target}</td>
      <td class="mono">${d.check_method.toUpperCase()}</td>
      <td class="mono">${timeAgo(d.last_checked_at)}</td>
      <td class="mono">${d.last_response_ms != null ? d.last_response_ms + "ms" : "—"}</td>
      <td class="mono">${d.consecutive_fails}/${d.fail_threshold}</td>
      <td></td>
    `;
    const tdActions = tr.lastElementChild;
    const delBtn = el("button", "btn-danger", "Remove");
    delBtn.onclick = async () => {
      if (!confirm(`Remove "${d.name}" from monitoring?`)) return;
      await api(`/devices/${d.device_id}`, { method: "DELETE" });
      refreshAll();
    };
    tdActions.appendChild(delBtn);
    body.appendChild(tr);
  });
}

// ---------- alerts ----------
async function refreshAlerts() {
  const alerts = await api("/alerts");
  const feed = document.getElementById("alertsFeed");
  feed.innerHTML = "";
  if (alerts.length === 0) {
    feed.appendChild(el("li", "empty-row", "No alerts have been raised yet."));
    return;
  }
  alerts.forEach((a) => {
    const li = el("li", `feed-item ${a.resolved_at ? "resolved" : "open"}`);
    li.innerHTML = `
      <div class="feed-title">${a.device_name} <span class="mono">(${a.device_target})</span></div>
      <div class="feed-meta">${a.resolved_at ? `RESOLVED · was open ${timeAgo(a.triggered_at)}` : `OPEN · triggered ${timeAgo(a.triggered_at)}`}</div>
      <div class="feed-desc">${a.description}</div>
    `;
    feed.appendChild(li);
  });
}

// ---------- notifications ----------
async function refreshNotifications() {
  const rows = await api("/notifications");
  const feed = document.getElementById("notifFeed");
  feed.innerHTML = "";
  if (rows.length === 0) {
    feed.appendChild(el("li", "empty-row", "No notifications dispatched yet."));
    return;
  }
  rows.forEach((n) => {
    const statusCls = n.delivery_status === "SENT" ? "sent" : n.delivery_status === "FAILED" ? "failed" : "sim";
    const li = el("li", `feed-item ${statusCls}`);
    const chanTag = n.channel === "EMAIL" ? `<span class="tag tag-email">EMAIL</span>` : `<span class="tag tag-sms">SMS</span>`;
    li.innerHTML = `
      <div class="feed-title">${chanTag}${n.device_name} → ${n.recipient}</div>
      <div class="feed-meta">${n.delivery_status} · ${timeAgo(n.sent_at)}</div>
      <div class="feed-desc">${n.detail || ""}</div>
    `;
    feed.appendChild(li);
  });
}

// ---------- administrators ----------
async function refreshAdmins() {
  const admins = await api("/administrators");
  const body = document.getElementById("adminsBody");
  body.innerHTML = "";
  if (admins.length === 0) {
    body.appendChild(el("tr", null, `<td colspan="5" class="empty-row">No administrators registered yet.</td>`));
    return;
  }
  admins.forEach((a) => {
    const tr = el("tr");
    tr.innerHTML = `
      <td>${a.full_name}</td>
      <td class="mono">${a.email || "—"}</td>
      <td class="mono">${a.phone_number || "—"}</td>
      <td>${a.notify_email ? '<span class="tag tag-email">EMAIL</span>' : ""} ${a.notify_sms ? '<span class="tag tag-sms">SMS</span>' : ""}</td>
      <td></td>
    `;
    const delBtn = el("button", "btn-danger", "Remove");
    delBtn.onclick = async () => {
      await api(`/administrators/${a.admin_id}`, { method: "DELETE" });
      refreshAdmins();
    };
    tr.lastElementChild.appendChild(delBtn);
    body.appendChild(tr);
  });
}

async function refreshAll() {
  await Promise.all([refreshSummary(), refreshDevices(), refreshAlerts(), refreshNotifications(), refreshAdmins()]);
}

// ---------- form wiring ----------
document.getElementById("toggleAddDevice").onclick = () =>
  document.getElementById("addDeviceForm").classList.toggle("hidden");
document.getElementById("toggleAddAdmin").onclick = () =>
  document.getElementById("addAdminForm").classList.toggle("hidden");

document.getElementById("addDeviceForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api("/devices", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(fd.entries())),
  });
  e.target.reset();
  e.target.classList.add("hidden");
  refreshAll();
};

document.getElementById("addAdminForm").onsubmit = async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  await api("/administrators", {
    method: "POST",
    body: JSON.stringify(Object.fromEntries(fd.entries())),
  });
  e.target.reset();
  e.target.classList.add("hidden");
  refreshAll();
};

document.getElementById("testAlertBtn").onclick = async () => {
  try {
    await api("/test-alert", { method: "POST" });
    refreshAll();
  } catch (err) {
    alert(err.message);
  }
};

refreshAll();
setInterval(refreshAll, 4000);
