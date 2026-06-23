const API_URL = "http://127.0.0.1:8000";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderTimelineEvents(events) {
    if (!events || events.length === 0) {
        return "<p>Henüz timeline kaydı yok.</p>";
    }

    return events.map(event => `
        <div class="timeline-item">
            <div class="timeline-dot"></div>
            <div>
                <div class="timeline-meta">
                    <strong>${escapeHtml(event.event_type)}</strong>
                    <span>${new Date(event.created_at).toLocaleString("tr-TR")}</span>
                </div>
                <p>${escapeHtml(event.description)}</p>
                <small>${escapeHtml(event.created_by)}</small>
            </div>
        </div>
    `).join("");
}

async function loadTimeline(resourceName, itemId, containerId) {
    const container = document.getElementById(containerId);

    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/${resourceName}/${itemId}/timeline`);

        if (!response.ok) {
            throw new Error("Timeline yüklenemedi");
        }

        const events = await response.json();
        container.innerHTML = renderTimelineEvents(events);
    } catch (error) {
        container.innerHTML = "<p>Timeline yüklenemedi.</p>";
    }
}

async function loadTeamDashboard(teamName) {
    await loadTeamTickets(teamName);
    await loadTeamRequests(teamName);
}

async function loadTeamTickets(teamName) {
    const list = document.getElementById("teamTickets");

    try {
        const response = await fetch(`${API_URL}/tickets`);
        const tickets = await response.json();

        const teamTickets = tickets.filter(ticket =>
            ticket.assigned_department === teamName &&
            ticket.status !== "Çözüldü"
        );

        if (teamTickets.length === 0) {
            list.innerHTML = "<div class='empty-state'>Bu ekibe atanmış açık ticket yok.</div>";
            return;
        }

        list.innerHTML = `
            <table class="ticket-table request-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Tür</th>
                        <th>Durum</th>
                        <th>Öncelik</th>
                        <th>Kullanıcı</th>
                        <th>İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${teamTickets.map(ticket => `
                        <tr>
                            <td><strong>${ticket.ticket_no}</strong></td>
                            <td>${ticket.issue_type}</td>
                            <td>
                                <span class="status-badge ${ticket.status === "Çözüldü" ? "status-solved" : ticket.status === "İnceleniyor" ? "status-reviewing" : "status-open"}">
                                    ${ticket.status}
                                </span>
                            </td>
                            <td>
                                <span class="priority-badge ${ticket.priority === "Yüksek" ? "priority-high" : ticket.priority === "Orta" || ticket.priority === "Düşük-Orta" ? "priority-medium" : "priority-low"}">
                                    ${ticket.priority}
                                </span>
                            </td>
                            <td>${ticket.full_name}</td>
                            <td>
                                <button onclick="showTeamTicketDetail(${ticket.id})">Detay</button>
                                <button onclick="startTicket(${ticket.id}, '${teamName}')">İncele</button>
                                <button onclick="solveTicket(${ticket.id}, '${teamName}')">Çöz</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

    } catch (error) {
        list.innerHTML = "<p>Ticketlar yüklenemedi.</p>";
    }
}

async function startTicket(id, teamName) {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const staffName = currentUser.full_name || currentUser.username || `${teamName} Staff`;

    await fetch(`${API_URL}/tickets/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            status: "İnceleniyor",
            assigned_department: teamName,
            assigned_to: staffName,
            priority: "Normal"
        })
    });

    loadTeamDashboard(teamName);
}

async function solveTicket(id, teamName) {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const staffName = currentUser.full_name || currentUser.username || `${teamName} Staff`;

    await fetch(`${API_URL}/tickets/${id}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            status: "Çözüldü",
            assigned_department: teamName,
            assigned_to: staffName,
            priority: "Normal"
        })
    });

    loadTeamDashboard(teamName);
}

async function loadTeamRequests(teamName) {
    const list = document.getElementById("teamRequests");

    try {
        const response = await fetch(`${API_URL}/requests`);
        const requests = await response.json();

        const teamRequests = requests.filter(request =>
            request.assigned_department === teamName &&
            request.approval_status === "Onaylandı"
        );

        if (teamRequests.length === 0) {
            list.innerHTML = "<div class='empty-state'>Bu ekibe atanmış onaylı request yok.</div>";
            return;
        }

        list.innerHTML = `
            <table class="ticket-table request-table">
                <thead>
                    <tr>
                        <th>No</th>
                        <th>Tür</th>
                        <th>Durum</th>
                        <th>Departman</th>
                        <th>Kullanıcı</th>
                        <th>İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${teamRequests.map(request => `
                        <tr>
                            <td><strong>${request.request_no}</strong></td>
                            <td>${request.request_type}</td>
                            <td>
                                <span class="status-badge ${request.approval_status === "Tamamlandı" ? "status-solved" : "status-reviewing"}">
                                    ${request.approval_status}
                                </span>
                            </td>
                            <td>${request.assigned_department || "-"}</td>
                            <td>${request.full_name}</td>
                            <td>
                                <button onclick="showTeamRequestDetail(${request.id})">Detay</button>
                                <button onclick="completeTeamRequest(${request.id}, '${teamName}')">Tamamla</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;

    } catch (error) {
        list.innerHTML = "<p>Requestler yüklenemedi.</p>";
    }
}

async function completeTeamRequest(id, teamName) {
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const staffName = currentUser.full_name || currentUser.username || `${teamName} Staff`;

    await fetch(`${API_URL}/requests/${id}/status`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            approval_status: "Tamamlandı",
            assigned_department: teamName,
            assigned_to: staffName
        })
    });

    loadTeamDashboard(teamName);
}

function logout() {
    localStorage.removeItem("currentUser");
    localStorage.removeItem("accessToken");
    window.location.href = "login.html";
}

async function showTeamTicketDetail(ticketId) {
    const detail = document.getElementById("teamTicketDetail");

    if (!detail) return;

    try {
        const response = await fetch(`${API_URL}/tickets/${ticketId}`);
        const ticket = await response.json();

        detail.innerHTML = `
            <div class="ticket-detail-card">
                <div class="detail-header">
                    <h3>${ticket.ticket_no}</h3>
                    <button class="close-detail-btn" onclick="closeTeamTicketDetail()">Kapat</button>
                </div>

                <p><strong>Kategori:</strong> ${ticket.issue_type}</p>
                <p><strong>Kullanıcı:</strong> ${ticket.full_name}</p>
                <p><strong>Departman:</strong> ${ticket.department}</p>
                <p><strong>Öncelik:</strong> ${ticket.priority}</p>
                <p><strong>Durum:</strong> ${ticket.status}</p>
                <p><strong>Açıklama:</strong></p>
                <p>${ticket.description}</p>

                <hr>

                <h3>Timeline</h3>
                <div id="teamTicketTimeline"></div>

                <hr>

                <h3>Mesajlaşma</h3>
                <div id="teamTicketMessages"></div>
                <textarea id="teamTicketNewMessage" placeholder="Kullanıcıya mesaj yaz..."></textarea>
                <button onclick="sendTeamTicketMessage(${ticket.id})">Gönder</button>
            </div>
        `;

        await loadTimeline("tickets", ticket.id, "teamTicketTimeline");
        await loadConversation("tickets", ticket.id, "teamTicketMessages");
        detail.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        detail.innerHTML = "<p>Ticket detayı yüklenemedi.</p>";
    }
}

function closeTeamTicketDetail() {
    const detail = document.getElementById("teamTicketDetail");

    if (detail) {
        detail.innerHTML = "";
    }
}

async function showTeamRequestDetail(requestId) {
    const detail = document.getElementById("teamRequestDetail");

    if (!detail) return;

    try {
        const response = await fetch(`${API_URL}/requests/${requestId}`);
        const request = await response.json();

        detail.innerHTML = `
            <div class="ticket-detail-card">
                <div class="detail-header">
                    <h3>${request.request_no}</h3>
                    <button class="close-detail-btn" onclick="closeTeamRequestDetail()">Kapat</button>
                </div>

                <p><strong>İstek Türü:</strong> ${request.request_type}</p>
                <p><strong>Kullanıcı:</strong> ${request.full_name}</p>
                <p><strong>Departman:</strong> ${request.department}</p>
                <p><strong>Durum:</strong> ${request.approval_status}</p>
                <p><strong>Açıklama:</strong></p>
                <p>${request.description}</p>

                <hr>

                <h3>Timeline</h3>
                <div id="teamRequestTimeline"></div>

                <hr>

                <h3>Mesajlaşma</h3>
                <div id="teamRequestMessages"></div>
                <textarea id="teamRequestNewMessage" placeholder="Kullanıcıya mesaj yaz..."></textarea>
                <button onclick="sendTeamRequestMessage(${request.id})">Gönder</button>
            </div>
        `;

        await loadTimeline("requests", request.id, "teamRequestTimeline");
        await loadConversation("requests", request.id, "teamRequestMessages");
        detail.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
        detail.innerHTML = "<p>Request detayı yüklenemedi.</p>";
    }
}

function closeTeamRequestDetail() {
    const detail = document.getElementById("teamRequestDetail");

    if (detail) {
        detail.innerHTML = "";
    }
}

async function loadConversation(resourceName, itemId, containerId) {
    const container = document.getElementById(containerId);

    if (!container) return;

    try {
        const response = await fetch(`${API_URL}/${resourceName}/${itemId}/messages`);

        if (!response.ok) {
            throw new Error("Mesajlar yüklenemedi");
        }

        const messages = await response.json();

        if (messages.length === 0) {
            container.innerHTML = "<p>Henüz mesaj yok.</p>";
            return;
        }

        container.innerHTML = messages.map(message => `
            <div class="message-box">
                <div class="message-meta">
                    <strong>${escapeHtml(message.sender_name)}</strong>
                    <span>${escapeHtml(message.sender_role)}</span>
                    <small>${new Date(message.created_at).toLocaleString("tr-TR")}</small>
                </div>
                <p>${escapeHtml(message.body)}</p>
            </div>
        `).join("");
    } catch (error) {
        container.innerHTML = "<p>Mesajlar yüklenemedi.</p>";
    }
}

async function sendConversationMessage(resourceName, itemId, inputId, containerId) {
    const input = document.getElementById(inputId);
    const body = input ? input.value.trim() : "";

    if (!body) {
        alert("Mesaj yazın.");
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const senderName =
        currentUser.full_name ||
        localStorage.getItem("username") ||
        "IT Staff";
    const senderRole =
        currentUser.role ||
        localStorage.getItem("role") ||
        "it_staff";

    const response = await fetch(`${API_URL}/${resourceName}/${itemId}/messages`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            sender_name: senderName,
            sender_role: senderRole,
            body
        })
    });

    if (!response.ok) {
        alert("Mesaj gönderilemedi.");
        return;
    }

    input.value = "";
    await loadConversation(resourceName, itemId, containerId);

    const timelineContainerId = containerId.replace("Messages", "Timeline");
    await loadTimeline(resourceName, itemId, timelineContainerId);
}

function sendTeamTicketMessage(ticketId) {
    return sendConversationMessage(
        "tickets",
        ticketId,
        "teamTicketNewMessage",
        "teamTicketMessages"
    );
}

function sendTeamRequestMessage(requestId) {
    return sendConversationMessage(
        "requests",
        requestId,
        "teamRequestNewMessage",
        "teamRequestMessages"
    );
}
