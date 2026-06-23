const API_URL = "http://127.0.0.1:8000";

function authHeaders() {
    const token = localStorage.getItem("accessToken");

    return token ? { Authorization: `Bearer ${token}` } : {};
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}

function renderAuditSummary(logs) {
    const summary = document.getElementById("auditSummary");
    if (!summary) return;

    const total = logs.length;
    const userActions = logs.filter(log => log.actor_role === "user").length;
    const adminActions = logs.filter(log => log.actor_role === "admin").length;
    const staffActions = logs.filter(log =>
        ["ms", "technical", "network", "staff", "admin_or_staff"].includes(log.actor_role)
    ).length;

    summary.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam Log</span>
            <strong>${total}</strong>
        </div>
        <div class="dashboard-card">
            <span>User İşlemi</span>
            <strong>${userActions}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Admin İşlemi</span>
            <strong>${adminActions}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>IT Staff İşlemi</span>
            <strong>${staffActions}</strong>
        </div>
    `;
}

function renderAuditLogs(logs) {
    const list = document.getElementById("auditLogList");
    if (!list) return;

    if (!logs || logs.length === 0) {
        list.innerHTML = `<div class="empty-state">Audit log kaydı yok.</div>`;
        return;
    }

    list.innerHTML = `
        <table class="ticket-table">
            <thead>
                <tr>
                    <th>Zaman</th>
                    <th>Aktör</th>
                    <th>Rol</th>
                    <th>İşlem</th>
                    <th>Kayıt</th>
                    <th>Detay</th>
                </tr>
            </thead>
            <tbody>
                ${logs.map(log => `
                    <tr>
                        <td>${new Date(log.created_at).toLocaleString("tr-TR")}</td>
                        <td>
                            <strong>${escapeHtml(log.actor_name)}</strong>
                            <br>
                            <small>${escapeHtml(log.actor_username)}</small>
                        </td>
                        <td>${escapeHtml(log.actor_role)}</td>
                        <td>${escapeHtml(log.action)}</td>
                        <td>${escapeHtml(log.item_no || "-")}</td>
                        <td>${escapeHtml(log.details)}</td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function loadAuditLogs() {
    const list = document.getElementById("auditLogList");

    try {
        const response = await fetch(`${API_URL}/audit-logs`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error("Audit log yüklenemedi");
        }

        const logs = await response.json();
        renderAuditSummary(logs);
        renderAuditLogs(logs);
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="empty-state">Audit log verisi yüklenemedi.</div>`;
        }
    }
}

window.addEventListener("DOMContentLoaded", loadAuditLogs);
