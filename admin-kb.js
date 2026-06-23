const API_URL = "http://127.0.0.1:8000";

let kbCache = [];

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

function resetKbForm() {
    document.getElementById("kbFormTitle").innerText = "Yeni KB Makalesi Oluştur";
    document.getElementById("kbFormSubmit").innerText = "Makale Kaydet";
    document.getElementById("kbArticleId").value = "";
    document.getElementById("kbTitle").value = "";
    document.getElementById("kbCategory").value = "";
    document.getElementById("kbKeywords").value = "";
    document.getElementById("kbContent").value = "";
    document.getElementById("kbSteps").value = "";
    document.getElementById("kbActive").value = "1";
}

function renderKbSummary(articles) {
    const summary = document.getElementById("kbSummary");
    if (!summary) return;

    const active = articles.filter(article => article.is_active === 1).length;
    const inactive = articles.length - active;

    summary.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam Makale</span>
            <strong>${articles.length}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Aktif</span>
            <strong>${active}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>Pasif</span>
            <strong>${inactive}</strong>
        </div>
        <div class="dashboard-card">
            <span>Kategori</span>
            <strong>${new Set(articles.map(article => article.category)).size}</strong>
        </div>
    `;
}

function renderKbArticles(articles) {
    const list = document.getElementById("kbList");
    if (!list) return;

    if (!articles || articles.length === 0) {
        list.innerHTML = `<div class="empty-state">KB makalesi bulunamadı.</div>`;
        return;
    }

    list.innerHTML = `
        <table class="ticket-table">
            <thead>
                <tr>
                    <th>Başlık</th>
                    <th>Kategori</th>
                    <th>Anahtar Kelimeler</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                </tr>
            </thead>
            <tbody>
                ${articles.map(article => `
                    <tr>
                        <td>
                            <strong>${escapeHtml(article.title)}</strong>
                            <br>
                            <small>${escapeHtml(article.content)}</small>
                        </td>
                        <td>${escapeHtml(article.category)}</td>
                        <td>${escapeHtml(article.keywords)}</td>
                        <td>
                            <span class="status-badge ${article.is_active ? "status-solved" : "status-reviewing"}">
                                ${article.is_active ? "Aktif" : "Pasif"}
                            </span>
                        </td>
                        <td>
                            <button onclick="editKbArticle(${article.id})">Düzenle</button>
                            <button onclick="deleteKbArticle(${article.id})">Sil</button>
                        </td>
                    </tr>
                `).join("")}
            </tbody>
        </table>
    `;
}

function filterKbArticles() {
    const query = document.getElementById("kbSearch").value.trim().toLowerCase();

    const filtered = kbCache.filter(article => {
        const searchable = [
            article.title,
            article.category,
            article.keywords,
            article.content,
            article.solution_steps || ""
        ].join(" ").toLowerCase();

        return searchable.includes(query);
    });

    renderKbArticles(filtered);
}

async function loadKbArticles() {
    const list = document.getElementById("kbList");

    try {
        const response = await fetch(`${API_URL}/kb/articles`, {
            headers: authHeaders()
        });

        if (!response.ok) {
            throw new Error("KB listesi yüklenemedi");
        }

        kbCache = await response.json();
        renderKbSummary(kbCache);
        renderKbArticles(kbCache);
    } catch (error) {
        if (list) {
            list.innerHTML = `<div class="empty-state">KB makaleleri yüklenemedi.</div>`;
        }
    }
}

function editKbArticle(articleId) {
    const article = kbCache.find(item => item.id === articleId);
    if (!article) return;

    document.getElementById("kbFormTitle").innerText = `KB Düzenle: ${article.title}`;
    document.getElementById("kbFormSubmit").innerText = "Güncelle";
    document.getElementById("kbArticleId").value = article.id;
    document.getElementById("kbTitle").value = article.title || "";
    document.getElementById("kbCategory").value = article.category || "";
    document.getElementById("kbKeywords").value = article.keywords || "";
    document.getElementById("kbContent").value = article.content || "";
    document.getElementById("kbSteps").value = article.solution_steps || "";
    document.getElementById("kbActive").value = String(article.is_active ?? 1);
    document.getElementById("kbForm").scrollIntoView({ behavior: "smooth" });
}

async function deleteKbArticle(articleId) {
    const article = kbCache.find(item => item.id === articleId);
    if (!article) return;

    if (!confirm(`${article.title} silinsin mi?`)) {
        return;
    }

    const response = await fetch(`${API_URL}/kb/articles/${articleId}`, {
        method: "DELETE",
        headers: authHeaders()
    });

    if (!response.ok) {
        alert("KB makalesi silinemedi.");
        return;
    }

    resetKbForm();
    loadKbArticles();
}

document.getElementById("kbForm").addEventListener("submit", async function (event) {
    event.preventDefault();

    const articleId = document.getElementById("kbArticleId").value.trim();
    const payload = {
        title: document.getElementById("kbTitle").value.trim(),
        category: document.getElementById("kbCategory").value.trim(),
        keywords: document.getElementById("kbKeywords").value.trim(),
        content: document.getElementById("kbContent").value.trim(),
        solution_steps: document.getElementById("kbSteps").value.trim(),
        is_active: Number(document.getElementById("kbActive").value)
    };

    const method = articleId ? "PUT" : "POST";
    const url = articleId ? `${API_URL}/kb/articles/${articleId}` : `${API_URL}/kb/articles`;

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
        alert(error.detail || "KB makalesi kaydedilemedi.");
        return;
    }

    resetKbForm();
    loadKbArticles();
});

window.addEventListener("DOMContentLoaded", loadKbArticles);
