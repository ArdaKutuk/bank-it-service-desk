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

function getCurrentUser() {
  return JSON.parse(localStorage.getItem("currentUser") || "{}");
}

// -------------------------
// USER REQUEST CREATE
// -------------------------

const requestForm = document.getElementById("requestForm");
const requestMessage = document.getElementById("requestMessage");

if (requestForm) {
  requestForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    const data = {
      full_name: document.getElementById("fullName").value,
      department: document.getElementById("department").value,
      request_type: document.getElementById("requestType").value,
      description: document.getElementById("description").value,
      created_by:
        getCurrentUser().username ||
        localStorage.getItem("username") ||
        document.getElementById("fullName").value
    };

    try {
      const response = await fetch(`${API_URL}/requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error("Talep oluşturulamadı");
      }

      const result = await response.json();

      requestMessage.innerText = `Talep başarıyla oluşturuldu: ${result.request_no}`;
      requestForm.reset();
      loadUserRequests();

    } catch (error) {
      requestMessage.innerText = "Talep oluşturulamadı. Backend bağlantısını kontrol et.";
    }
  });
}


// -------------------------
// USER REQUEST LIST / CHAT
// -------------------------

async function loadUserRequests() {
  const list = document.getElementById("userRequestsList");
  if (!list) return;

  try {
    const currentUser = getCurrentUser();
    const username = currentUser.username || localStorage.getItem("username");
    const fullName = currentUser.full_name;

    const response = await fetch(`${API_URL}/requests`);
    const requests = await response.json();

    const userRequests = requests.filter(req =>
      req.created_by === username ||
      req.created_by === fullName ||
      req.full_name === fullName ||
      req.full_name === username
    );

    renderRequestTable("userRequestsList", userRequests, {
      emptyMessage: "Henüz istek talebiniz yok.",
      actions: req => `<button onclick="showUserRequestDetail(${req.id})">Detay</button>`
    });
  } catch (error) {
    list.innerHTML = "<p>İstek talepleri yüklenemedi.</p>";
  }
}

async function showUserRequestDetail(requestId) {
  const detail = document.getElementById("userRequestDetail");
  if (!detail) return;

  try {
    const response = await fetch(`${API_URL}/requests/${requestId}`);
    const req = await response.json();

    detail.innerHTML = `
      <div class="ticket-detail-card">
        <div class="detail-header">
          <h3>${req.request_no}</h3>
          <button class="close-detail-btn" onclick="closeUserRequestDetail()">Kapat</button>
        </div>

        <p><strong>İstek Türü:</strong> ${req.request_type}</p>
        <p><strong>Durum:</strong> ${req.approval_status}</p>
        <p><strong>Atanan Birim:</strong> ${req.assigned_department || "-"}</p>
        <p><strong>Açıklama:</strong></p>
        <p>${req.description}</p>

        <hr>

        <h3>Timeline</h3>
        <div id="userRequestTimeline"></div>

        <hr>

        <h3>Mesajlaşma</h3>
        <div id="userRequestMessages"></div>
        <textarea id="userRequestNewMessage" placeholder="IT ekibine mesaj yaz..."></textarea>
        <button onclick="sendRequestMessage(${req.id}, 'userRequestNewMessage', 'userRequestMessages')">Gönder</button>
      </div>
    `;

    await loadTimeline("requests", req.id, "userRequestTimeline");
    await loadRequestMessages(req.id, "userRequestMessages");
    detail.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    detail.innerHTML = "<p>İstek detayı yüklenemedi.</p>";
  }
}

function closeUserRequestDetail() {
  const detail = document.getElementById("userRequestDetail");

  if (detail) {
    detail.innerHTML = "";
  }
}

function renderRequestTable(targetId, requests, config) {
  const list = document.getElementById(targetId);
  if (!list) return;

  if (!requests || requests.length === 0) {
    list.innerHTML = `<div class="empty-state">${config.emptyMessage}</div>`;
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
          <th>Oluşturan</th>
          <th>İşlem</th>
        </tr>
      </thead>
      <tbody>
        ${requests.map(req => `
          <tr>
            <td><strong>${req.request_no}</strong></td>
            <td>${req.request_type}</td>
            <td>
              <span class="status-badge ${req.approval_status === "Onaylandı" ? "status-solved" : req.approval_status === "Reddedildi" ? "status-open" : "status-reviewing"}">
                ${req.approval_status}
              </span>
            </td>
            <td>${req.assigned_department || "-"}</td>
            <td>${req.full_name || req.created_by || "-"}</td>
            <td>${config.actions(req)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}


// -------------------------
// ADMIN REQUEST APPROVAL
// -------------------------

async function loadAdminRequests() {
  const list = document.getElementById("adminRequestsList");
  if (!list) return;

  try {
    const response = await fetch(`${API_URL}/requests`);
    const requests = await response.json();

    const pendingRequests = requests.filter(
      req => req.approval_status === "Onay Bekliyor"
    );

    renderRequestTable("adminRequestsList", pendingRequests, {
      emptyMessage: "Onay bekleyen istek talebi yok.",
      actions: req => `
        <button onclick="approveRequest(${req.id})">Onayla</button>
        <button onclick="rejectRequest(${req.id})">Reddet</button>
      `
    });

  } catch (error) {
    list.innerHTML = "<p>Admin request listesi yüklenemedi.</p>";
  }
}


async function approveRequest(id) {
  const requestResponse = await fetch(`${API_URL}/requests/${id}`);
  const request = await requestResponse.json();

  await fetch(`${API_URL}/requests/${id}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      approval_status: "Onaylandı",
      assigned_department: request.assigned_department,
      assigned_to: null
    })
  });

  loadAdminRequests();
}

async function rejectRequest(id) {
  await fetch(`${API_URL}/requests/${id}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      approval_status: "Reddedildi",
      assigned_department: null,
      assigned_to: null
    })
  });

  loadAdminRequests();
}


// -------------------------
// IT STAFF REQUEST INBOX
// -------------------------

async function loadStaffRequests() {
  const list = document.getElementById("staffRequestsList");
  if (!list) return;

  try {
    const response = await fetch(`${API_URL}/requests`);
    const requests = await response.json();

    const approvedRequests = requests.filter(
      req => req.approval_status === "Onaylandı"
    );

    renderRequestTable("staffRequestsList", approvedRequests, {
      emptyMessage: "IT request kutusunda onaylanmış talep yok.",
      actions: req => `
        <button onclick="showStaffRequestDetail(${req.id})">Detay</button>
        <button onclick="completeRequest(${req.id})">Tamamlandı</button>
      `
    });

  } catch (error) {
    list.innerHTML = "<p>Staff request listesi yüklenemedi.</p>";
  }
}


async function completeRequest(id) {
  await fetch(`${API_URL}/requests/${id}/status`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      approval_status: "Tamamlandı",
      assigned_department: "Technical",
      assigned_to: "IT Staff"
    })
  });

  loadStaffRequests();
}


loadAdminRequests();
loadStaffRequests();
loadUserRequests();

async function showStaffRequestDetail(requestId) {
  const detail = document.getElementById("staffRequestDetail");
  if (!detail) return;

  try {
    const response = await fetch(`${API_URL}/requests/${requestId}`);
    const req = await response.json();

    detail.innerHTML = `
      <div class="ticket-detail-card">
        <div class="detail-header">
          <h3>${req.request_no}</h3>
          <button class="close-detail-btn" onclick="closeStaffRequestDetail()">Kapat</button>
        </div>

        <p><strong>İstek Türü:</strong> ${req.request_type}</p>
        <p><strong>Kullanıcı:</strong> ${req.full_name}</p>
        <p><strong>Departman:</strong> ${req.department}</p>
        <p><strong>Durum:</strong> ${req.approval_status}</p>
        <p><strong>Açıklama:</strong></p>
        <p>${req.description}</p>

        <hr>

        <h3>Timeline</h3>
        <div id="staffRequestTimeline"></div>

        <hr>

        <h3>Mesajlaşma</h3>
        <div id="staffRequestMessages"></div>
        <textarea id="staffRequestNewMessage" placeholder="Kullanıcıya mesaj yaz..."></textarea>
        <button onclick="sendRequestMessage(${req.id}, 'staffRequestNewMessage', 'staffRequestMessages')">Gönder</button>
      </div>
    `;

    await loadTimeline("requests", req.id, "staffRequestTimeline");
    await loadRequestMessages(req.id, "staffRequestMessages");
    detail.scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    detail.innerHTML = "<p>İstek detayı yüklenemedi.</p>";
  }
}

function closeStaffRequestDetail() {
  const detail = document.getElementById("staffRequestDetail");

  if (detail) {
    detail.innerHTML = "";
  }
}

async function loadRequestMessages(requestId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  try {
    const response = await fetch(`${API_URL}/requests/${requestId}/messages`);

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

async function sendRequestMessage(requestId, inputId, containerId) {
  const input = document.getElementById(inputId);
  const body = input ? input.value.trim() : "";

  if (!body) {
    alert("Mesaj yazın.");
    return;
  }

  const currentUser = getCurrentUser();
  const senderName =
    currentUser.full_name ||
    localStorage.getItem("username") ||
    "Bilinmeyen";
  const senderRole =
    currentUser.role ||
    localStorage.getItem("role") ||
    "user";

  const response = await fetch(`${API_URL}/requests/${requestId}/messages`, {
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
  await loadRequestMessages(requestId, containerId);

  const timelineContainerId = containerId.replace("Messages", "Timeline");
  await loadTimeline("requests", requestId, timelineContainerId);
}
function goBack() {
    window.location.href = "index.html";
}

function logout() {
    localStorage.clear();
    window.location.href = "login.html";
}
