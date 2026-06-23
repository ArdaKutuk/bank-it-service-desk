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

function renderAiAgentSummary(reports) {
    const summary = document.getElementById("aiAgentSummary");
    if (!summary) return;

    const total = reports.length;
    const rerouted = reports.filter(report => report.action === "rerouted").length;
    const unknown = reports.filter(report =>
        report.action === "classified_unknown" ||
        report.action === "triage_unknown"
    ).length;
    const avgConfidence = total
        ? Math.round(reports.reduce((sum, report) => sum + report.confidence, 0) / total)
        : 0;

    summary.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam Müdahale</span>
            <strong>${total}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>Yeniden Yönlendirme</span>
            <strong>${rerouted}</strong>
        </div>
        <div class="dashboard-card">
            <span>Bilinmeyen Kategori</span>
            <strong>${unknown}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Ortalama Güven</span>
            <strong>%${avgConfidence}</strong>
        </div>
    `;
}

function getActionLabel(action) {
    const labels = {
        rerouted: "Yeniden yönlendirdi",
        classified_unknown: "Bilinmeyeni sınıflandırdı",
        triage_unknown: "Triage kuyruğuna aldı",
        validated: "Doğruladı",
        no_intervention: "Müdahale etmedi"
    };

    return labels[action] || action;
}

function renderAiAgentReports(reports) {
    const list = document.getElementById("aiAgentReportsList");
    if (!list) return;

    if (!reports || reports.length === 0) {
        list.innerHTML = `<div class="empty-state">AI Agent müdahale kaydı bulunamadı.</div>`;
        return;
    }

    list.innerHTML = `
        <table class="ticket-table ai-agent-table">
            <thead>
                <tr>
                    <th>Zaman</th>
                    <th>Kayıt</th>
                    <th>Seçilen Kategori</th>
                    <th>İlk Birim</th>
                    <th>Agent Kararı</th>
                    <th>Güven</th>
                    <th>Açıklama</th>
                </tr>
            </thead>
            <tbody>
                ${reports.map(report => `
                    <tr>
                        <td>${new Date(report.created_at).toLocaleString("tr-TR")}</td>
                        <td>${escapeHtml(report.item_no)}</td>
                        <td>${escapeHtml(report.selected_issue_type || "-")}</td>
                        <td>${escapeHtml(report.original_department || "-")}</td>
                        <td>
                            <strong>${escapeHtml(report.suggested_department)}</strong>
                            <br>
                            <small>${escapeHtml(getActionLabel(report.action))}</small>
                        </td>
                        <td>
                            <span class="status-badge ${report.confidence >= 70 ? "status-solved" : "status-reviewing"}">
                                %${report.confidence}
                            </span>
                        </td>
                        <td class="ai-agent-reason">
                            <div>${escapeHtml(report.reason)}</div>
                            <br>
                            <small>Veri kapsamı: ${escapeHtml(report.data_scope)}</small>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

async function loadAiAgentReports() {
    const list = document.getElementById("aiAgentReportsList");

    try {
        const response = await fetch(`${API_URL}/ai-agent-reports`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error("AI Agent raporları yüklenemedi");
        }

        const reports = await response.json();
        renderAiAgentSummary(reports);
        renderAiAgentReports(reports);
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="empty-state">AI Agent raporları yüklenemedi.</div>`;
        }
    }
}

window.addEventListener("DOMContentLoaded", loadAiAgentReports);
