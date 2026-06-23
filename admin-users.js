const API_URL = "http://127.0.0.1:8000";

let usersCache = [];

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

function resetUserForm() {
    document.getElementById("userFormTitle").innerText = "Yeni Kullanıcı Oluştur";
    document.getElementById("userFormSubmit").innerText = "Kullanıcıyı Kaydet";
    document.getElementById("userId").value = "";
    document.getElementById("userFullName").value = "";
    document.getElementById("userUsername").value = "";
    document.getElementById("userRole").value = "user";
    document.getElementById("userDepartment").value = "";
    document.getElementById("userPassword").value = "";
}

function renderUserSummary(users) {
    const summary = document.getElementById("userSummary");
    if (!summary) return;

    const totals = {
        admin: users.filter(user => user.role === "admin").length,
        staff: users.filter(user => ["ms", "technical", "network"].includes(user.role)).length,
        user: users.filter(user => user.role === "user").length,
        all: users.length
    };

    summary.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam Kullanıcı</span>
            <strong>${totals.all}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Admin</span>
            <strong>${totals.admin}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>IT Staff</span>
            <strong>${totals.staff}</strong>
        </div>
        <div class="dashboard-card">
            <span>Son Kullanıcı</span>
            <strong>${totals.user}</strong>
        </div>
    `;
}

function renderUsers(users) {
    const list = document.getElementById("userList");
    if (!list) return;

    if (!users || users.length === 0) {
        list.innerHTML = `<div class="empty-state">Kullanıcı bulunamadı.</div>`;
        return;
    }

    list.innerHTML = `
        <table class="ticket-table">
            <thead>
                <tr>
                    <th>Ad Soyad</th>
                    <th>Kullanıcı Adı</th>
                    <th>Rol</th>
                    <th>Departman</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
                ${users.map(user => `
                    <tr>
                        <td>${escapeHtml(user.full_name)}</td>
                        <td>${escapeHtml(user.username)}</td>
                        <td>${escapeHtml(user.role)}</td>
                        <td>${escapeHtml(user.department || "-")}</td>
                        <td>
                            <button onclick="editUser(${user.id})">Düzenle</button>
                            <button onclick="deleteUser(${user.id})">Sil</button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function filterUsers() {
    const query = document.getElementById("userSearch").value.trim().toLowerCase();

    const filtered = usersCache.filter(user => {
        const searchable = [
            user.full_name,
            user.username,
            user.role,
            user.department || ""
        ].join(" ").toLowerCase();

        return searchable.includes(query);
    });

    renderUsers(filtered);
}

async function loadUsers() {
    const list = document.getElementById("userList");

    try {
        const response = await fetch(`${API_URL}/users`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error("Kullanıcı listesi yüklenemedi");
        }

        usersCache = await response.json();
        renderUserSummary(usersCache);
        renderUsers(usersCache);
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="empty-state">Kullanıcılar yüklenemedi.</div>`;
        }
    }
}

function editUser(userId) {
    const user = usersCache.find(item => item.id === userId);
    if (!user) return;

    document.getElementById("userFormTitle").innerText = `Kullanıcı Düzenle: ${user.username}`;
    document.getElementById("userFormSubmit").innerText = "Güncelle";
    document.getElementById("userId").value = user.id;
    document.getElementById("userFullName").value = user.full_name || "";
    document.getElementById("userUsername").value = user.username || "";
    document.getElementById("userRole").value = user.role || "user";
    document.getElementById("userDepartment").value = user.department || "";
    document.getElementById("userPassword").value = "";
    document.getElementById("userForm").scrollIntoView({ behavior: "smooth" });
}

async function deleteUser(userId) {
    const user = usersCache.find(item => item.id === userId);
    if (!user) return;

    if (!confirm(`${user.username} hesabı silinsin mi?`)) {
        return;
    }

    const response = await fetch(`${API_URL}/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders()
    });

    if (!response.ok) {
        alert("Kullanıcı silinemedi.");
        return;
    }

    resetUserForm();
    loadUsers();
}

document.getElementById("userForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const userId = document.getElementById("userId").value.trim();
    const payload = {
        full_name: document.getElementById("userFullName").value.trim(),
        username: document.getElementById("userUsername").value.trim(),
        role: document.getElementById("userRole").value,
        department: document.getElementById("userDepartment").value.trim()
    };

    const password = document.getElementById("userPassword").value.trim();
    if (password) {
        payload.password = password;
    }

    const method = userId ? "PUT" : "POST";
    const url = userId ? `${API_URL}/users/${userId}` : `${API_URL}/users`;

    const response = await fetch(url, {
        method,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders()
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        alert(error.detail || "Kullanıcı kaydedilemedi.");
        return;
    }

    resetUserForm();
    loadUsers();
});

window.addEventListener("DOMContentLoaded", loadUsers);
