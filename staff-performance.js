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

function renderSummary(rows) {
    const summary = document.getElementById("staffPerformanceSummary");
    if (!summary) return;

    const totalItems = rows.reduce((sum, row) => sum + row.total_work_items, 0);
    const completedItems = rows.reduce(
        (sum, row) => sum + row.solved_tickets + row.completed_requests,
        0
    );
    const activeItems = rows.reduce(
        (sum, row) => sum + row.active_tickets + row.active_requests,
        0
    );
    const completionRate = totalItems
        ? ((completedItems / totalItems) * 100).toFixed(1)
        : "0.0";

    summary.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam İş</span>
            <strong>${totalItems}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Tamamlanan</span>
            <strong>${completedItems}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>Aktif İş</span>
            <strong>${activeItems}</strong>
        </div>
        <div class="dashboard-card">
            <span>Tamamlanma Oranı</span>
            <strong>%${completionRate}</strong>
        </div>
    `;
}

function renderPerformanceRows(rows) {
    const list = document.getElementById("staffPerformanceList");
    if (!list) return;

    if (!rows || rows.length === 0) {
        list.innerHTML = `<div class="empty-state">Performans verisi bulunamadı.</div>`;
        return;
    }

    list.innerHTML = `
        <table class="ticket-table">
            <thead>
                <tr>
                    <th>Personel</th>
                    <th>Birim</th>
                    <th>Ticket</th>
                    <th>Request</th>
                    <th>Aktif</th>
                    <th>Tamamlanma</th>
                    <th>Ort. Ticket Çözüm</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(row => `
                    <tr>
                        <td>${escapeHtml(row.staff)}</td>
                        <td>${escapeHtml(row.department || "-")}</td>
                        <td>${row.solved_tickets}/${row.assigned_tickets}</td>
                        <td>${row.completed_requests}/${row.assigned_requests}</td>
                        <td>${row.active_tickets + row.active_requests}</td>
                        <td>
                            <span class="status-badge ${row.completion_rate >= 70 ? "status-solved" : "status-reviewing"}">
                                %${row.completion_rate}
                            </span>
                        </td>
                        <td>
                            ${row.avg_ticket_resolution_hours === null
                                ? "-"
                                : `${row.avg_ticket_resolution_hours} saat`}
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function loadStaffPerformance() {
    const list = document.getElementById("staffPerformanceList");

    try {
        const response = await fetch(`${API_URL}/staff-performance`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error("Staff performance yüklenemedi");
        }

        const rows = await response.json();
        renderSummary(rows);
        renderPerformanceRows(rows);
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="empty-state">Staff performance verisi yüklenemedi.</div>`;
        }
    }
}

window.addEventListener("DOMContentLoaded", loadStaffPerformance);
