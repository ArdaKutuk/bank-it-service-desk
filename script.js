const currentRole = localStorage.getItem("role");
let adminDashboardState = {
    tickets: [],
    requests: [],
    filter: "all"
};
let ticketListState = [];

function showUserPanel(panelName) {
    const panelMap = {
        chatbot: "chatbotPanel",
        ticket: "ticketPanel",
        request: "requestPanel",
        tickets: "ticketsPanel"
    };

    Object.values(panelMap).forEach(panelId => {
        const panel = document.getElementById(panelId);

        if (panel) {
            panel.classList.toggle("active", panelId === panelMap[panelName]);
        }
    });

    document.querySelectorAll(".user-menu-item").forEach(item => {
        item.classList.toggle("active", item.dataset.section === panelName);
    });

    if (panelName === "tickets") {
        loadTickets();
    }

    if (panelName === "request") {
        loadUserRequestsForPortal();
    }
}

function calculateRemainingSLA(ticket) {

    if (!ticket.sla_hours) {
        return "-";
    }

    if (!ticket.created_at) {
        return "-";
    }

    const createdDate = new Date(ticket.created_at);

    const deadline = new Date(
        createdDate.getTime() +
        ticket.sla_hours * 60 * 60 * 1000
    );

    const now = new Date();

    const diff = deadline - now;

    if (diff <= 0) {
        return "🔴 SLA Aşıldı";
    }

    const hours =
        Math.floor(diff / (1000 * 60 * 60));

    const minutes =
        Math.floor(
            (diff % (1000 * 60 * 60))
            / (1000 * 60)
        );

    return `${hours}s ${minutes}dk`;
}

function getSlaMeta(ticket) {
    if (!ticket.sla_hours || !ticket.created_at) {
        return {
            label: "-",
            className: "sla-muted",
            overdue: false,
            critical: false
        };
    }

    const createdDate = new Date(ticket.created_at);
    const deadline = new Date(createdDate.getTime() + (ticket.sla_hours * 60 * 60 * 1000));
    const now = new Date();
    const diff = deadline - now;
    const hoursLeft = diff / (1000 * 60 * 60);

    if (diff <= 0) {
        return {
            label: "Aşıldı",
            className: "sla-overdue",
            overdue: true,
            critical: true
        };
    }

    if (hoursLeft <= 2) {
        return {
            label: calculateRemainingSLA(ticket),
            className: "sla-critical",
            overdue: false,
            critical: true
        };
    }

    if (hoursLeft <= 6) {
        return {
            label: calculateRemainingSLA(ticket),
            className: "sla-warning",
            overdue: false,
            critical: false
        };
    }

    return {
        label: calculateRemainingSLA(ticket),
        className: "sla-ok",
        overdue: false,
        critical: false
    };
}
window.onload = function () {
    if (currentRole === "user") {
        const dashboard = document.getElementById("dashboard");
        const reports = document.getElementById("reportsSection");

        if (dashboard) dashboard.style.display = "none";
        if (reports) reports.style.display = "none";
    }
};
const API_URL = "http://127.0.0.1:8000";

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getCurrentPortalUser() {
    try {
        return JSON.parse(localStorage.getItem("currentUser") || "{}");
    } catch (error) {
        return {};
    }
}

function getPortalUsername() {
    const user = getCurrentPortalUser();
    return user.username || localStorage.getItem("username") || user.full_name || "";
}

function getPortalDisplayName() {
    const user = getCurrentPortalUser();
    return user.full_name || user.name || user.username || localStorage.getItem("username") || "";
}

function setRequestMessage(message, isError = false) {
    const messageBox = document.getElementById("requestMessage");

    if (!messageBox) return;

    messageBox.textContent = message;
    messageBox.classList.toggle("error-message", isError);
}

async function createPortalRequest(event) {
    event.preventDefault();

    const fullNameInput = document.getElementById("requestFullName");
    const departmentInput = document.getElementById("requestDepartment");
    const requestTypeInput = document.getElementById("requestType");
    const descriptionInput = document.getElementById("requestDescription");

    if (!fullNameInput || !departmentInput || !requestTypeInput || !descriptionInput) {
        return;
    }

    const payload = {
        full_name: fullNameInput.value.trim(),
        department: departmentInput.value.trim(),
        request_type: requestTypeInput.value,
        description: descriptionInput.value.trim(),
        created_by: getPortalUsername() || fullNameInput.value.trim()
    };

    if (!payload.full_name || !payload.department || !payload.request_type || !payload.description) {
        setRequestMessage("Lütfen tüm istek alanlarını doldurun.", true);
        return;
    }

    setRequestMessage("İstek oluşturuluyor...");

    try {
        const response = await fetch(`${API_URL}/requests`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            throw new Error("İstek oluşturulamadı");
        }

        document.getElementById("requestForm").reset();
        document.querySelectorAll("#requestDepartmentCards .service-logo-card, #requestTopicArea .service-topic-card").forEach(card => {
            card.classList.remove("active");
        });
        document.getElementById("requestTopicArea").innerHTML = "";
        document.getElementById("requestPreparedNotice").innerHTML = "";
        setRequestMessage("İstek başarıyla oluşturuldu.");
        loadUserRequestsForPortal();
    } catch (error) {
        setRequestMessage("İstek oluşturulamadı. Backend bağlantısını veya zorunlu alanları kontrol edin.", true);
    }
}

function requestBelongsToCurrentUser(request) {
    const username = getPortalUsername();
    const displayName = getPortalDisplayName();
    const candidates = [username, displayName].filter(Boolean);

    if (candidates.length === 0) {
        return true;
    }

    return candidates.some(value => (
        request.created_by === value ||
        request.full_name === value
    ));
}

async function loadUserRequestsForPortal() {
    const list = document.getElementById("userRequestsList");

    if (!list) return;

    list.innerHTML = "<p>İstekler yükleniyor...</p>";

    try {
        const response = await fetch(`${API_URL}/requests`);

        if (!response.ok) {
            throw new Error("İstekler yüklenemedi");
        }

        const requests = await response.json();
        const userRequests = requests.filter(requestBelongsToCurrentUser);

        renderPortalRequests(userRequests);
    } catch (error) {
        list.innerHTML = "<p>İstekler yüklenemedi. Backend bağlantısını kontrol edin.</p>";
    }
}

function renderPortalRequests(requests) {
    const list = document.getElementById("userRequestsList");

    if (!list) return;

    if (!requests || requests.length === 0) {
        list.innerHTML = "<p>Henüz istek talebiniz yok.</p>";
        return;
    }

    list.innerHTML = `
        <div class="table-wrap">
            <table class="ticket-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Tür</th>
                        <th>Departman</th>
                        <th>Durum</th>
                        <th>Tarih</th>
                        <th>İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${requests.map(request => `
                        <tr>
                            <td>${request.id}</td>
                            <td>${escapeHtml(request.request_type)}</td>
                            <td>${escapeHtml(request.department)}</td>
                            <td>${escapeHtml(request.status)}</td>
                            <td>${request.created_at ? new Date(request.created_at).toLocaleString("tr-TR") : "-"}</td>
                            <td>
                                <button type="button" class="secondary-btn" onclick="showPortalRequestDetail(${request.id})">Detay</button>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        </div>
    `;
}

async function showPortalRequestDetail(requestId) {
    const detail = document.getElementById("userRequestDetail");

    if (!detail) return;

    detail.innerHTML = "<p>İstek detayı yükleniyor...</p>";

    try {
        const response = await fetch(`${API_URL}/requests/${requestId}`);

        if (!response.ok) {
            throw new Error("İstek detayı yüklenemedi");
        }

        const request = await response.json();
        detail.innerHTML = `
            <div class="ticket-detail-card">
                <div class="top-right-actions">
                    <button type="button" class="secondary-btn" onclick="closePortalRequestDetail()">Kapat</button>
                </div>
                <h3>İstek #${request.id}</h3>
                <p><strong>Ad Soyad:</strong> ${escapeHtml(request.full_name)}</p>
                <p><strong>Departman:</strong> ${escapeHtml(request.department)}</p>
                <p><strong>İstek Türü:</strong> ${escapeHtml(request.request_type)}</p>
                <p><strong>Durum:</strong> ${escapeHtml(request.status)}</p>
                <p><strong>Açıklama:</strong> ${escapeHtml(request.description)}</p>
                <div id="userRequestTimeline" class="timeline"></div>
            </div>
        `;

        loadTimeline("requests", request.id, "userRequestTimeline");
    } catch (error) {
        detail.innerHTML = "<p>İstek detayı yüklenemedi.</p>";
    }
}

function closePortalRequestDetail() {
    const detail = document.getElementById("userRequestDetail");

    if (detail) {
        detail.innerHTML = "";
    }
}

function initializePortalRequestForm() {
    const requestForm = document.getElementById("requestForm");

    if (!requestForm) return;

    requestForm.addEventListener("submit", createPortalRequest);

    const user = getCurrentPortalUser();
    const fullNameInput = document.getElementById("requestFullName");
    const departmentInput = document.getElementById("requestDepartment");

    if (fullNameInput && !fullNameInput.value) {
        fullNameInput.value = user.full_name || user.name || user.username || localStorage.getItem("username") || "";
    }

    if (departmentInput && !departmentInput.value) {
        departmentInput.value = user.department || "";
    }
}

initializePortalRequestForm();

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

function renderKbArticleList(articles) {
    if (!articles || articles.length === 0) {
        return "";
    }

    return `
        <div class="kb-source-list">
            <strong>Kaynak KB makaleleri</strong>
            ${articles.map(article => `
                <div class="kb-source-item">
                    <span>${escapeHtml(article.title)}</span>
                    <small>${escapeHtml(article.category)}</small>
                </div>
            `).join("")}
        </div>
    `;
}

function normalizeSupportText(value) {
    return String(value || "")
        .toLowerCase()
        .replaceAll("ç", "c")
        .replaceAll("ğ", "g")
        .replaceAll("ı", "i")
        .replaceAll("ö", "o")
        .replaceAll("ş", "s")
        .replaceAll("ü", "u")
        .replace(/[-_/\\.]/g, " ");
}

const supportSuggestionRules = [
    { issue: "email_delivery", keywords: ["eposta", "e posta", "email", "mail", "gonderemiyorum", "alamiyorum", "teslim edilemedi"] },
    { issue: "password", keywords: ["sifre", "parola", "password", "kilit", "kilitlendi"] },
    { issue: "mfa", keywords: ["mfa", "otp", "authenticator", "dogrulama", "kod gelmiyor"] },
    { issue: "vpn", keywords: ["vpn", "uzak erisim", "remote"] },
    { issue: "internal_app_access", keywords: ["ic sistem", "core banking", "uygulama acilmiyor", "firewall", "erisim"] },
    { issue: "wifi", keywords: ["wifi", "wi fi", "kablosuz", "wireless"] },
    { issue: "internet", keywords: ["internet", "web sitesi", "dis ag"] },
    { issue: "lan", keywords: ["ethernet", "kablolu", "port", "kablo"] },
    { issue: "network_drive", keywords: ["ortak klasor", "paylasim", "network drive", "mapped drive"] },
    { issue: "printer", keywords: ["yazici", "printer", "toner", "kagit", "cikti"] },
    { issue: "scanner", keywords: ["tarayici", "scanner", "scan"] },
    { issue: "monitor", keywords: ["monitor", "ekran", "goruntu", "hdmi"] },
    { issue: "keyboard_mouse", keywords: ["klavye", "keyboard", "mouse", "fare", "touchpad"] },
    { issue: "laptop", keywords: ["laptop", "notebook", "sarj", "batarya", "isinma"] },
    { issue: "teams", keywords: ["teams", "toplanti", "mikrofon", "kamera", "ses"] },
    { issue: "onedrive", keywords: ["onedrive", "one drive", "senkron", "sync"] },
    { issue: "sharepoint", keywords: ["sharepoint", "site", "dokuman", "belge"] },
    { issue: "office_apps", keywords: ["excel", "word", "powerpoint", "office", "aktivasyon"] },
    { issue: "outlook", keywords: ["outlook"] }
];

function getSupportSuggestion(question) {
    const normalizedQuestion = normalizeSupportText(question);
    let bestMatch = null;

    supportSuggestionRules.forEach(rule => {
        const score = rule.keywords.reduce((total, keyword) => (
            normalizedQuestion.includes(keyword) ? total + 1 : total
        ), 0);

        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
            bestMatch = {
                issue: rule.issue,
                score
            };
        }
    });

    if (!bestMatch || !issues[bestMatch.issue]) {
        return null;
    }

    return {
        issueKey: bestMatch.issue,
        issue: issues[bestMatch.issue],
        confidence: Math.min(95, 55 + (bestMatch.score * 15))
    };
}

function renderSupportSuggestion(question) {
    const suggestion = getSupportSuggestion(question);

    if (!suggestion) {
        return `
            <div class="support-suggestion">
                <strong>Öneri bulunamadı</strong>
                <p>Ticket açmadan önce listeden en yakın sorun türünü seçin veya açıklamayı daha ayrıntılı yazın.</p>
            </div>
        `;
    }

    return `
        <div class="support-suggestion">
            <strong>Önerilen çağrı türü: ${escapeHtml(suggestion.issue.team)}</strong>
            <p><strong>Seçilmesi gereken sorun:</strong> ${escapeHtml(suggestion.issue.category)}</p>
            <p><strong>Güven:</strong> %${suggestion.confidence}</p>
            <button type="button" onclick="openTicketWithSuggestion('${suggestion.issueKey}')">
                Bu sorunla ticket aç
            </button>
        </div>
    `;
}

function openTicketWithSuggestion(issueKey) {
    const question = document.getElementById("kbQuestion")?.value.trim() || "";
    const issueSelect = document.getElementById("issueSelect");
    const summary = document.getElementById("summary");

    showUserPanel("ticket");

    if (issueSelect) {
        issueSelect.value = issueKey;
    }

    syncTicketVisualSelection(issueKey);
    prepareTicketFormFromTopic(issueKey);

    if (summary && question) {
        summary.value = buildTicketSummary(issueKey, question);
    }

    showSolution();
}

async function askKnowledgeBase() {
    const questionInput = document.getElementById("kbQuestion");
    const answerBox = document.getElementById("kbAnswer");
    const question = questionInput ? questionInput.value.trim() : "";

    if (!answerBox) return;

    if (!question) {
        answerBox.innerHTML = "<p>Önce sorununuzu yazın.</p>";
        return;
    }

    answerBox.innerHTML = "<p>Knowledge Base içinde aranıyor...</p>";

    try {
        const response = await fetch(`${API_URL}/kb/ask`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ question })
        });

        if (!response.ok) {
            throw new Error("KB cevabı alınamadı");
        }

        const result = await response.json();
        const ticketButton = `
            <button type="button" onclick="openTicketFromKb()">
                Çözülmedi, ticket aç
            </button>
        `;

        answerBox.innerHTML = `
            ${renderSupportSuggestion(question)}
            <div class="kb-answer-meta">
                <span>Güven: %${result.confidence}</span>
                <span>Veri kapsamı: ${escapeHtml(result.data_scope)}</span>
            </div>
            <pre>${escapeHtml(result.answer)}</pre>
            ${renderKbArticleList(result.matched_articles)}
            ${ticketButton}
        `;
    } catch (error) {
        answerBox.innerHTML = `
            <p>KB yanıtı alınamadı. Backend bağlantısını kontrol edin.</p>
            <button type="button" onclick="openTicketFromKb()">Çözülmedi, ticket aç</button>
        `;
    }
}

function openTicketFromKb() {
    const question = document.getElementById("kbQuestion")?.value.trim() || "";
    const suggestion = getSupportSuggestion(question);
    const issueSelect = document.getElementById("issueSelect");
    const summary = document.getElementById("summary");
    const ticketForm = document.getElementById("ticketForm");

    showUserPanel("ticket");

    if (suggestion && issueSelect) {
        issueSelect.value = suggestion.issueKey;
        syncTicketVisualSelection(suggestion.issueKey);
        prepareTicketFormFromTopic(suggestion.issueKey);
    }

    if (summary && question && suggestion) {
        summary.value = buildTicketSummary(suggestion.issueKey, question);
    } else if (summary && question) {
        summary.value = question;
    }

    if (suggestion) {
        showSolution();
    }

    if (ticketForm) {
        ticketForm.scrollIntoView({ behavior: "smooth" });
    }
}

function clearKbChat() {
    const questionInput = document.getElementById("kbQuestion");
    const answerBox = document.getElementById("kbAnswer");

    if (questionInput) {
        questionInput.value = "";
    }

    if (answerBox) {
        answerBox.innerHTML = "Sorununuzu yazın; asistan uygun ticket türünü, sorun seçimini ve KB önerilerini gösterecek.";
    }
}

const issues = {
    outlook: {
        category: "Outlook",
        team: "MS Departmanı",
        priority: "Orta",
        ticket: "Outlook uygulaması veya web Outlook erişim problemi. Hesap, profil, lisans ve servis durumu kontrol edilmelidir.",
        steps: [
            "Web Outlook ile giriş deneyin.",
            "Outlook uygulamasını kapatıp yeniden açın.",
            "İnternet bağlantısını ve hata mesajını kontrol edin.",
            "Sorun tek kullanıcıda mı genel mi ayrıştırın."
        ]
    },

    email_delivery: {
        category: "E-posta Gönderme / Alma",
        team: "MS Departmanı",
        priority: "Orta",
        ticket: "E-posta gönderme, alma, gecikme veya bounce problemi. Mail akışı, kota, alıcı adresi ve kural kontrolleri yapılmalıdır.",
        steps: [
            "Eposta/e-posta adresinin doğru yazıldığını kontrol edin.",
            "Web Outlook üzerinden gönderim deneyin.",
            "Hata veya geri dönüş mesajını açıklamaya ekleyin.",
            "Mailbox kota ve kural durumunu kontrol edin."
        ]
    },

    teams: {
        category: "Microsoft Teams",
        team: "MS Departmanı",
        priority: "Orta",
        ticket: "Teams toplantı, ses, kamera veya chat problemi. Uygulama, web erişimi, izinler ve lisans durumu kontrol edilmelidir.",
        steps: [
            "Teams web sürümünü deneyin.",
            "Mikrofon/kamera izinlerini kontrol edin.",
            "Teams cache temizliği ihtimalini değerlendirin.",
            "Genel Microsoft servis durumu kontrol edilir."
        ]
    },

    password: {
        category: "Şifre / Hesap Kilidi",
        team: "MS Departmanı",
        priority: "Yüksek",
        ticket: "Kullanıcı şifre, parola süresi veya hesap kilidi problemi yaşıyor. AD/Microsoft hesap durumu kontrol edilmelidir.",
        steps: [
            "Caps Lock ve kullanıcı adını kontrol edin.",
            "Son değiştirilen şifrenin kullanıldığını doğrulayın.",
            "Hesap kilidi veya parola süresi kontrol edilir.",
            "Kimlik doğrulama süreciyle reset yapılır."
        ]
    },

    mfa: {
        category: "MFA / Authenticator",
        team: "MS Departmanı",
        priority: "Yüksek",
        ticket: "MFA, OTP, Authenticator bildirimi veya doğrulama problemi. Kullanıcı doğrulama yöntemi ve kayıt durumu kontrol edilmelidir.",
        steps: [
            "Telefon saatinin otomatik olduğundan emin olun.",
            "Authenticator bildiriminin gelip gelmediğini kontrol edin.",
            "SMS/OTP alternatifi varsa deneyin.",
            "MFA kayıt durumu IT tarafından kontrol edilir."
        ]
    },

    account_access: {
        category: "Oturum Açma / Hesap Erişimi",
        team: "MS Departmanı",
        priority: "Yüksek",
        ticket: "Kullanıcı kurumsal hesaba veya uygulama oturumuna giriş yapamıyor. Hesap durumu, yetki ve oturum politikası kontrol edilmelidir.",
        steps: [
            "Hata mesajını not edin.",
            "Farklı tarayıcı veya gizli pencere ile deneyin.",
            "Hesap aktifliği ve lisans durumu kontrol edilir.",
            "Yetki eksikliği varsa request süreci başlatılır."
        ]
    },

    onedrive: {
        category: "OneDrive",
        team: "MS Departmanı",
        priority: "Düşük-Orta",
        ticket: "OneDrive erişim, senkronizasyon veya kota problemi. Lisans, kota ve sync client durumu kontrol edilmelidir.",
        steps: [
            "OneDrive ikonundaki hata durumunu kontrol edin.",
            "Web OneDrive erişimini deneyin.",
            "Senkronize olmayan klasörü açıklamaya ekleyin.",
            "Kota ve lisans kontrol edilir."
        ]
    },

    sharepoint: {
        category: "SharePoint",
        team: "MS Departmanı",
        priority: "Orta",
        ticket: "SharePoint site, doküman kitaplığı veya dosya erişim problemi. Site izni, link ve senkronizasyon durumu kontrol edilmelidir.",
        steps: [
            "Linkin doğru olduğunu kontrol edin.",
            "Farklı tarayıcı ile deneyin.",
            "Site yetkisini kontrol ettirin.",
            "Dosya kilidi veya eş zamanlı düzenleme ihtimali değerlendirilir."
        ]
    },

    office_apps: {
        category: "Office Uygulamaları",
        team: "MS Departmanı",
        priority: "Orta",
        ticket: "Word, Excel, PowerPoint veya Office lisans/aktivasyon problemi. Uygulama onarım ve lisans kontrolleri yapılmalıdır.",
        steps: [
            "Office uygulamasını yeniden başlatın.",
            "Aynı dosyayı web sürümünde deneyin.",
            "Lisans/aktivasyon uyarısını açıklamaya ekleyin.",
            "Office repair veya güncelleme değerlendirilir."
        ]
    },

    mailbox_quota: {
        category: "Mailbox Kota",
        team: "MS Departmanı",
        priority: "Düşük-Orta",
        ticket: "Posta kutusu kota doluluğu veya arşivleme problemi. Mailbox boyutu, arşiv ve saklama politikası kontrol edilmelidir.",
        steps: [
            "Silinmiş öğeleri temizleyin.",
            "Büyük ekli mailleri kontrol edin.",
            "Online archive görünürlüğünü kontrol edin.",
            "Kota artışı gerekiyorsa request açın."
        ]
    },

    distribution_group: {
        category: "Dağıtım Grubu / Ortak Mailbox",
        team: "MS Departmanı",
        priority: "Düşük-Orta",
        ticket: "Dağıtım grubu, ortak mailbox veya grup üyeliği problemi. Üyelik, gönderme yetkisi ve adres defteri kontrol edilmelidir.",
        steps: [
            "Grup adını ve beklenen üyeliği yazın.",
            "Gönderme yetkisi mi alma sorunu mu belirtin.",
            "Outlook adres defteri güncelliğini kontrol edin.",
            "Yetki değişikliği gerekiyorsa request açın."
        ]
    },

    calendar: {
        category: "Takvim / Toplantı",
        team: "MS Departmanı",
        priority: "Düşük-Orta",
        ticket: "Takvim daveti, toplantı odası, uygunluk veya paylaşımlı takvim problemi. Calendar izinleri ve istemci durumu kontrol edilmelidir.",
        steps: [
            "Web Outlook takvimini deneyin.",
            "Toplantı davetinde hata mesajı varsa ekleyin.",
            "Paylaşımlı takvim yetkisini kontrol ettirin.",
            "Oda/ekipman takvimi için yetki süreci incelenir."
        ]
    },

    vpn: {
        category: "VPN / Uzak Erişim",
        team: "Network Departmanı",
        priority: "Yüksek",
        ticket: "VPN bağlantısı, MFA sonrası erişim veya iç kaynak erişimi problemi. Kimlik doğrulama ve ağ erişimi ayrıştırılmalıdır.",
        steps: [
            "İnternet bağlantısını kontrol edin.",
            "VPN uygulamasını yeniden başlatın.",
            "MFA onayının tamamlandığını doğrulayın.",
            "VPN bağlanıyor ama iç sistem açılmıyorsa bunu açıklamaya yazın."
        ]
    },

    internet: {
        category: "İnternet Erişimi",
        team: "Network Departmanı",
        priority: "Yüksek",
        ticket: "Kullanıcı internet erişimi alamıyor veya sitelere çıkamıyor. Lokasyon, kablo/Wi-Fi ve proxy/DNS durumu kontrol edilmelidir.",
        steps: [
            "Başka siteler açılıyor mu kontrol edin.",
            "Kablolu/kablosuz bağlantıyı değiştirerek deneyin.",
            "Aynı lokasyonda genel sorun var mı bakın.",
            "Hata ekranını açıklamaya ekleyin."
        ]
    },

    wifi: {
        category: "Wi-Fi / Kablosuz",
        team: "Network Departmanı",
        priority: "Düşük-Orta",
        ticket: "Wi-Fi bağlantı, kopma veya zayıf sinyal problemi. SSID, sinyal ve cihaz bağlantı durumu kontrol edilmelidir.",
        steps: [
            "Doğru Wi-Fi ağına bağlandığınızı kontrol edin.",
            "Wi-Fi kapat/aç yapın.",
            "Yakın konumdaki başka kullanıcıları kontrol edin.",
            "Cihaz MAC/sertifika durumu gerekebilir."
        ]
    },

    lan: {
        category: "Kablolu Ağ / Ethernet",
        team: "Network Departmanı",
        priority: "Yüksek",
        ticket: "Ethernet portu, kablo veya IP alma problemi. Fiziksel bağlantı, port aktivasyonu ve DHCP kontrol edilmelidir.",
        steps: [
            "Ethernet kablosunu çıkarıp takın.",
            "Farklı kablo/port varsa deneyin.",
            "Cihaz IP alıyor mu kontrol edilir.",
            "Port aktivasyonu gerekiyorsa request açın."
        ]
    },

    dns: {
        category: "DNS / İsim Çözümleme",
        team: "Network Departmanı",
        priority: "Orta",
        ticket: "Alan adı çözümleme, internal URL veya DNS kaynaklı erişim problemi. DNS kayıtları ve istemci çözümleme durumu kontrol edilmelidir.",
        steps: [
            "IP ile erişim olup olmadığını not edin.",
            "Sadece bir adres mi tüm adresler mi etkileniyor belirtin.",
            "DNS cache temizliği denenir.",
            "İlgili URL açıklamaya eklenir."
        ]
    },

    network_drive: {
        category: "Ortak Klasör / Network Drive",
        team: "Network Departmanı",
        priority: "Orta",
        ticket: "Ortak klasör, paylaşımlı sürücü veya mapped drive erişim problemi. Yol, yetki ve ağ bağlantısı kontrol edilmelidir.",
        steps: [
            "Paylaşım yolunu açıklamaya ekleyin.",
            "VPN veya kurum ağına bağlı olduğunuzu doğrulayın.",
            "Yetki hatası mı bağlantı hatası mı belirtin.",
            "Drive yeniden map edilebilir."
        ]
    },

    internal_app_access: {
        category: "İç Uygulama Erişimi",
        team: "Network Departmanı",
        priority: "Yüksek",
        ticket: "Core banking veya kurum içi uygulama erişim problemi. Ağ rotası, yetki, firewall ve uygulama erişimi kontrol edilmelidir.",
        steps: [
            "Uygulama adını ve URL/IP bilgisini yazın.",
            "VPN/kampüs ağı durumunu belirtin.",
            "Hata mesajı veya ekran görüntüsü ekleyin.",
            "Yetki mi bağlantı mı ayrıştırılır."
        ]
    },

    slow_network: {
        category: "Ağ Yavaşlığı / Kopma",
        team: "Network Departmanı",
        priority: "Orta",
        ticket: "Ağ yavaşlığı, kopma veya paket kaybı problemi. Lokasyon, saat aralığı ve etki alanı incelenmelidir.",
        steps: [
            "Sorunun başladığı saati not edin.",
            "Kablolu ve Wi-Fi durumunu ayrı deneyin.",
            "Aynı lokasyonda başka kullanıcı var mı kontrol edin.",
            "Ping veya hız testi sonucu varsa ekleyin."
        ]
    },

    printer_network: {
        category: "Network Yazıcı",
        team: "Network Departmanı",
        priority: "Orta",
        ticket: "Network yazıcıya erişim, kuyruk veya IP bağlantı problemi. Yazıcı ağı, IP ve print queue durumu kontrol edilmelidir.",
        steps: [
            "Yazıcı adını veya IP bilgisini yazın.",
            "Yazıcı online mı kontrol edin.",
            "Başka kullanıcı yazdırabiliyor mu bakın.",
            "Kuyruk temizliği veya yeniden ekleme denenir."
        ]
    },

    voip: {
        category: "Telefon / VoIP",
        team: "Network Departmanı",
        priority: "Orta",
        ticket: "Masa telefonu, softphone, ses kesilmesi veya dahili arama problemi. Network ve santral tarafı kontrol edilmelidir.",
        steps: [
            "Dahili numaranızı yazın.",
            "Sorun gelen mi giden aramada mı belirtin.",
            "Telefonu yeniden başlatın.",
            "Aynı bölgede genel sorun var mı kontrol edilir."
        ]
    },

    laptop: {
        category: "Laptop",
        team: "Technical Ekibi",
        priority: "Orta",
        ticket: "Laptop açılmama, performans, batarya veya fiziksel arıza problemi. Cihaz durumu ve donanım kontrolü yapılmalıdır.",
        steps: [
            "Adaptörü ve şarj ışığını kontrol edin.",
            "Harici cihazları çıkarıp deneyin.",
            "Isınma/ses/hata ışığı varsa açıklamaya yazın.",
            "Garanti veya yedek cihaz süreci değerlendirilebilir."
        ]
    },

    desktop: {
        category: "Masaüstü Bilgisayar",
        team: "Technical Ekibi",
        priority: "Orta",
        ticket: "Masaüstü PC açılmama, donma veya performans problemi. Güç, donanım ve işletim sistemi kontrolleri yapılmalıdır.",
        steps: [
            "Güç kablosu ve priz kontrol edilir.",
            "Monitör ayrı olarak kontrol edilir.",
            "Hata sesi/ışığı varsa not edilir.",
            "Son kurulan yazılım veya güncelleme belirtilir."
        ]
    },

    monitor: {
        category: "Monitör / Ekran",
        team: "Technical Ekibi",
        priority: "Düşük-Orta",
        ticket: "Monitör görüntü, kablo, çözünürlük veya ikinci ekran problemi. Kablo, giriş kaynağı ve ekran ayarları kontrol edilmelidir.",
        steps: [
            "Güç ve görüntü kablosunu kontrol edin.",
            "Doğru giriş kaynağını seçin.",
            "Laptop ekran yansıtma ayarını kontrol edin.",
            "Farklı kablo/monitör ile denenebilir."
        ]
    },

    keyboard_mouse: {
        category: "Klavye / Mouse",
        team: "Technical Ekibi",
        priority: "Düşük-Orta",
        ticket: "Klavye, mouse, touchpad veya alıcı cihaz problemi. Fiziksel bağlantı ve cihaz değişimi değerlendirilmelidir.",
        steps: [
            "USB alıcı veya kabloyu çıkarıp takın.",
            "Kablosuz ise pil kontrol edin.",
            "Başka USB porta takın.",
            "Arıza devam ederse değişim talebi açılır."
        ]
    },

    printer: {
        category: "Yazıcı",
        team: "Technical Ekibi",
        priority: "Orta",
        ticket: "Yazıcı çıktı, toner, kağıt sıkışması veya sürücü problemi. Fiziksel yazıcı ve driver kontrolleri yapılmalıdır.",
        steps: [
            "Kağıt ve toner durumunu kontrol edin.",
            "Yazıcı ekranındaki hata kodunu yazın.",
            "Kuyrukta bekleyen işleri kontrol edin.",
            "Sürücü yeniden kurulumu gerekebilir."
        ]
    },

    scanner: {
        category: "Tarayıcı / Scanner",
        team: "Technical Ekibi",
        priority: "Düşük-Orta",
        ticket: "Tarayıcı çalışmama, görüntü kalitesi veya uygulama bağlantı problemi. Cihaz ve sürücü kontrol edilmelidir.",
        steps: [
            "Cihazın açık ve bağlı olduğunu kontrol edin.",
            "Tarama uygulamasındaki hata mesajını yazın.",
            "Farklı belge ile deneyin.",
            "Sürücü veya profil ayarı kontrol edilir."
        ]
    },

    peripheral: {
        category: "Çevre Birimi",
        team: "Technical Ekibi",
        priority: "Düşük-Orta",
        ticket: "Kamera, kulaklık, adaptör, docking station veya diğer çevre birimi problemi. Bağlantı ve cihaz sürücüsü kontrol edilmelidir.",
        steps: [
            "Cihazı çıkarıp yeniden takın.",
            "Farklı USB/Type-C port deneyin.",
            "Teams/Zoom cihaz seçimini kontrol edin.",
            "Fiziksel hasar varsa açıklamaya yazın."
        ]
    },

    mobile_device: {
        category: "Mobil Cihaz",
        team: "Technical Ekibi",
        priority: "Düşük-Orta",
        ticket: "Kurum telefonu, tablet veya mobil uygulama cihaz problemi. Cihaz, bağlantı ve yönetim profili kontrol edilmelidir.",
        steps: [
            "Cihazı yeniden başlatın.",
            "Wi-Fi/mobil veri durumunu kontrol edin.",
            "Kurumsal profil uyarısı varsa yazın.",
            "Fiziksel hasar varsa belirtin."
        ]
    },

    pos_atm_device: {
        category: "POS / ATM / Kart Okuyucu",
        team: "Technical Ekibi",
        priority: "Yüksek",
        ticket: "POS, ATM yan cihazı, token veya kart okuyucu arızası. Şube operasyon etkisi yüksek olduğundan cihaz kontrolü önceliklidir.",
        steps: [
            "Cihaz modelini ve lokasyonu yazın.",
            "Hata kodu varsa açıklamaya ekleyin.",
            "Güç ve bağlantı kablolarını kontrol edin.",
            "İşlem etkisi varsa aciliyet belirtin."
        ]
    },

    software_install: {
        category: "Yazılım Kurulum",
        team: "Technical Ekibi",
        priority: "Orta",
        ticket: "Standart yazılım kurulum, kaldırma veya güncelleme problemi. Paket, yetki ve cihaz uyumluluğu kontrol edilmelidir.",
        steps: [
            "Yazılım adını ve sürümünü yazın.",
            "Kurulumdaki hata mesajını ekleyin.",
            "Admin yetkisi gerekip gerekmediği kontrol edilir.",
            "Lisans gerekiyorsa request açılır."
        ]
    }
};

const ticketDepartmentGroups = [
    {
        id: "ms",
        title: "Microsoft 365",
        subtitle: "Eposta, hesap, Teams ve Office",
        logo: "MS",
        team: "MS Departmanı",
        issues: [
            "outlook",
            "email_delivery",
            "teams",
            "password",
            "mfa",
            "account_access",
            "onedrive",
            "sharepoint",
            "office_apps",
            "mailbox_quota",
            "distribution_group",
            "calendar"
        ]
    },
    {
        id: "network",
        title: "Network",
        subtitle: "VPN, internet, Wi-Fi ve erişim",
        logo: "NW",
        team: "Network Departmanı",
        issues: [
            "vpn",
            "internet",
            "wifi",
            "lan",
            "dns",
            "network_drive",
            "internal_app_access",
            "slow_network",
            "printer_network",
            "voip"
        ]
    },
    {
        id: "technical",
        title: "Teknik Destek",
        subtitle: "Cihaz, yazıcı, çevre birimi ve kurulum",
        logo: "TD",
        team: "Technical Ekibi",
        issues: [
            "laptop",
            "desktop",
            "monitor",
            "keyboard_mouse",
            "printer",
            "scanner",
            "peripheral",
            "mobile_device",
            "pos_atm_device",
            "software_install"
        ]
    }
];

const requestDepartmentGroups = [
    {
        id: "hardware",
        title: "Donanım Talepleri",
        subtitle: "Cihaz ve çevre birimi ihtiyaçları",
        logo: "HW",
        requests: [
            "Monitör Talebi",
            "Mouse Talebi",
            "Klavye Talebi",
            "Laptop Talebi",
            "Docking Station Talebi",
            "Kulaklık/Kamera Talebi",
            "Yazıcı/Tarayıcı Talebi",
            "Mobil Cihaz Talebi"
        ]
    },
    {
        id: "microsoft-access",
        title: "Microsoft ve Yetki",
        subtitle: "Lisans, mailbox, grup ve paylaşım",
        logo: "MS",
        requests: [
            "Yazılım Talebi",
            "Lisans Talebi",
            "Yetki Talebi",
            "Ortak Mailbox Talebi",
            "Dağıtım Grubu Talebi",
            "Dosya Paylaşım Alanı Talebi"
        ]
    },
    {
        id: "network-request",
        title: "Network Talepleri",
        subtitle: "VPN, IP, port, firewall ve uygulama erişimi",
        logo: "NW",
        requests: [
            "VPN Yetkisi",
            "Statik IP Talebi",
            "Network Port Aktivasyonu",
            "Firewall Erişim Talebi",
            "Uygulama Erişim Talebi"
        ]
    }
];

function renderServiceLogoCards(containerId, groups, onSelectName) {
    const container = document.getElementById(containerId);

    if (!container) return;

    container.innerHTML = groups.map(group => `
        <button class="service-logo-card" type="button" data-group="${group.id}" onclick="${onSelectName}('${group.id}')">
            <span class="service-logo-mark">${escapeHtml(group.logo)}</span>
            <span class="service-logo-title">${escapeHtml(group.title)}</span>
            <small>${escapeHtml(group.subtitle)}</small>
        </button>
    `).join("");
}

function setActiveServiceCard(containerId, selectedGroupId) {
    document.querySelectorAll(`#${containerId} .service-logo-card`).forEach(card => {
        card.classList.toggle("active", card.dataset.group === selectedGroupId);
    });
}

function selectTicketDepartment(groupId) {
    const group = ticketDepartmentGroups.find(item => item.id === groupId);
    const topicArea = document.getElementById("ticketTopicArea");

    if (!group || !topicArea) return;

    setActiveServiceCard("ticketDepartmentCards", groupId);

    topicArea.innerHTML = `
        <div class="service-topic-header">
            <h3>${escapeHtml(group.title)} Alt Başlıkları</h3>
            <p>${escapeHtml(group.team)} için uygun sorun başlığını seçin.</p>
        </div>
        <div class="service-topic-grid">
            ${group.issues.map(issueKey => {
                const issue = issues[issueKey];
                return `
                    <button class="service-topic-card" type="button" data-issue="${issueKey}" onclick="selectTicketTopic('${issueKey}')">
                        <strong>${escapeHtml(issue.category)}</strong>
                        <span>${escapeHtml(issue.priority)} öncelik</span>
                    </button>
                `;
            }).join("")}
        </div>
    `;
}

function selectTicketTopic(issueKey) {
    const issueSelect = document.getElementById("issueSelect");

    if (issueSelect) {
        issueSelect.value = issueKey;
    }

    syncTicketVisualSelection(issueKey);
    prepareTicketFormFromTopic(issueKey);
    showSolution();
}

function fillCurrentUserFields(fullNameId, departmentId) {
    const user = getCurrentPortalUser();
    const fullNameInput = document.getElementById(fullNameId);
    const departmentInput = document.getElementById(departmentId);

    if (fullNameInput && !fullNameInput.value.trim()) {
        fullNameInput.value = user.full_name || user.name || user.username || localStorage.getItem("username") || "";
    }

    if (departmentInput && !departmentInput.value.trim()) {
        departmentInput.value = user.department || "";
    }
}

function buildTicketSummary(issueKey, userDescription = "") {
    const issue = issues[issueKey];

    if (!issue) {
        return userDescription;
    }

    return [
        `Seçilen konu: ${issue.category}`,
        `Atanacak ekip: ${issue.team}`,
        `Öncelik: ${issue.priority}`,
        `Önerilen ilk kontrol: ${issue.steps[0] || "-"}`,
        "",
        "Kullanıcı açıklaması:",
        userDescription
    ].join("\n");
}

function prepareTicketFormFromTopic(issueKey) {
    const issue = issues[issueKey];
    const summary = document.getElementById("summary");
    const notice = document.getElementById("ticketPreparedNotice");

    if (!issue) return;

    fillCurrentUserFields("fullName", "department");

    const template = buildTicketSummary(issueKey);

    if (summary && (!summary.value.trim() || summary.value.startsWith("Seçilen konu:"))) {
        summary.value = template;
        summary.focus();
    }

    if (notice) {
        notice.innerHTML = `
            <strong>Ticket taslağı hazırlandı.</strong>
            <span>${escapeHtml(issue.category)} seçildi, ilgili ekip ${escapeHtml(issue.team)} olarak belirlendi. Açıklamayı tamamlayıp ticketı oluşturabilirsiniz.</span>
        `;
    }
}

function syncTicketVisualSelection(issueKey) {
    if (!issueKey || !issues[issueKey]) return;

    const group = ticketDepartmentGroups.find(item => item.issues.includes(issueKey));

    if (group) {
        selectTicketDepartment(group.id);
    }

    document.querySelectorAll(".service-topic-card").forEach(card => {
        card.classList.toggle("active", card.dataset.issue === issueKey);
    });
}

function selectRequestDepartment(groupId) {
    const group = requestDepartmentGroups.find(item => item.id === groupId);
    const topicArea = document.getElementById("requestTopicArea");

    if (!group || !topicArea) return;

    setActiveServiceCard("requestDepartmentCards", groupId);

    topicArea.innerHTML = `
        <div class="service-topic-header">
            <h3>${escapeHtml(group.title)} Alt Başlıkları</h3>
            <p>İstek talebinizin türünü seçin.</p>
        </div>
        <div class="service-topic-grid">
            ${group.requests.map(requestType => `
                <button class="service-topic-card" type="button" data-request-type="${escapeHtml(requestType)}" onclick="selectRequestTopic('${escapeHtml(requestType)}')">
                    <strong>${escapeHtml(requestType)}</strong>
                    <span>Request kaydı</span>
                </button>
            `).join("")}
        </div>
    `;
}

function selectRequestTopic(requestType) {
    const requestTypeInput = document.getElementById("requestType");

    if (requestTypeInput) {
        requestTypeInput.value = requestType;
    }

    document.querySelectorAll(".service-topic-card[data-request-type]").forEach(card => {
        card.classList.toggle("active", card.dataset.requestType === requestType);
    });

    prepareRequestFormFromTopic(requestType);
    setRequestMessage(`${requestType} seçildi. Açıklamayı tamamlayıp isteği oluşturabilirsiniz.`);
}

function prepareRequestFormFromTopic(requestType) {
    const description = document.getElementById("requestDescription");
    const notice = document.getElementById("requestPreparedNotice");

    fillCurrentUserFields("requestFullName", "requestDepartment");

    const template = [
        `Seçilen istek: ${requestType}`,
        "",
        "Talep gerekçesi:",
        "",
        "Kullanım amacı / ihtiyaç detayı:",
        ""
    ].join("\n");

    if (description && (!description.value.trim() || description.value.startsWith("Seçilen istek:"))) {
        description.value = template;
        description.focus();
    }

    if (notice) {
        notice.innerHTML = `
            <strong>İstek taslağı hazırlandı.</strong>
            <span>${escapeHtml(requestType)} seçildi. Açıklama alanındaki gerekçe ve ihtiyaç detayını tamamlayabilirsiniz.</span>
        `;
    }
}

function initializeServicePickers() {
    renderServiceLogoCards("ticketDepartmentCards", ticketDepartmentGroups, "selectTicketDepartment");
    renderServiceLogoCards("requestDepartmentCards", requestDepartmentGroups, "selectRequestDepartment");
}

initializeServicePickers();

function showSolution() {
    const selectedIssue = document.getElementById("issueSelect").value;
    const resultDiv = document.getElementById("result");
    const questionArea = document.getElementById("questionArea");

    questionArea.innerHTML = "";

    if (selectedIssue === "") {
        resultDiv.innerHTML = "<p>Lütfen bir kategori seçiniz.</p>";
        return;
    }

    const issue = issues[selectedIssue];

    if (selectedIssue === "vpn") {
        questionArea.innerHTML = `
            <h3>Ek Soru</h3>
            <p>VPN'e giriş yapabiliyor musunuz?</p>

            <button onclick="vpnAnswer('yes')">Evet</button>
            <button onclick="vpnAnswer('no')">Hayır</button>
        `;
    }

    resultDiv.innerHTML = `
        <h3>Yönlendirme Sonucu</h3>

        <p><strong>Kategori:</strong> ${issue.category}</p>
        <p><strong>Ekip:</strong> ${issue.team}</p>
        <p><strong>Öncelik:</strong> ${issue.priority}</p>

        <p><strong>Ön Kontrol Adımları:</strong></p>
        <ol>
            ${issue.steps.map(step => `<li>${step}</li>`).join("")}
        </ol>

        <p><strong>Ticket Açıklaması:</strong></p>
        <p>${issue.ticket}</p>

        <p><strong>Güvenlik Notu:</strong></p>
        <p>
            Bu araç kişisel veri işlemez, kurumsal sistemlere bağlanmaz,
            dış yapay zeka servisi kullanmaz ve yalnızca önceden tanımlanmış
            kurallar üzerinden yönlendirme yapar.
        </p>
    `;
}

function vpnAnswer(answer) {
    const resultDiv = document.getElementById("result");

    if (answer === "yes") {
        resultDiv.innerHTML += `
            <hr>
            <p><strong>Ek Değerlendirme:</strong></p>
            <p>
                VPN bağlantısı kuruluyor fakat iç sistemlere erişimde sorun olabilir.
                Network ekibine yönlendirme yapılmalıdır.
            </p>
        `;
    } else {
        resultDiv.innerHTML += `
            <hr>
            <p><strong>Ek Değerlendirme:</strong></p>
            <p>
                VPN'e giriş yapılamıyor. Hesap, parola veya MFA kaynaklı sorun olabilir.
                MS departmanı kontrol etmelidir.
            </p>
        `;
    }
}
async function createTicket() {
    const fullName = document.getElementById("fullName").value;
    const department = document.getElementById("department").value;
    const description = document.getElementById("summary").value;
    const issueType = document.getElementById("issueSelect").value;
    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const createdBy = currentUser.username || localStorage.getItem("username") || fullName;

    if (!fullName || !department || !description || !issueType) {
        alert("Lütfen tüm alanları doldurun.");
        return;
    }

    try {
        const response = await fetch("http://127.0.0.1:8000/tickets", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                full_name: fullName,
                department: department,
                issue_type: issueType,
                description: description,
                created_by: createdBy
            })
        });

        if (!response.ok) {
            const error = await response.json();
            console.log("Backend hatası:", error);
            alert("Ticket oluşturulurken hata oluştu.");
            return;
        }

        const ticket = await response.json();

        alert(`Ticket oluşturuldu: ${ticket.ticket_no}`);

        document.getElementById("fullName").value = "";
        document.getElementById("department").value = "";
        document.getElementById("summary").value = "";
        document.getElementById("issueSelect").value = "";
        document.getElementById("ticketTopicArea").innerHTML = "";
        document.querySelectorAll("#ticketDepartmentCards .service-logo-card").forEach(card => {
            card.classList.remove("active");
        });
        document.getElementById("ticketPreparedNotice").innerHTML = "";
        document.getElementById("result").innerHTML = "Yönlendirme sonucu burada görüntülenecek.";
        document.getElementById("questionArea").innerHTML = "";

        loadTickets();
        showUserPanel("tickets");

    } catch (error) {
        console.log("Frontend hatası:", error);
        alert("Backend bağlantı hatası.");
    }
}
function getStatusClass(status) {
    if (status === "Açık") return "status-open";
    if (status === "İnceleniyor") return "status-reviewing";
    if (status === "Çözüldü") return "status-solved";
    return "";
}

function getPriorityClass(priority) {
    if (priority === "Yüksek") return "priority-high";
    if (priority === "Orta" || priority === "Düşük-Orta") return "priority-medium";
    if (priority === "Düşük") return "priority-low";
    return "";
}
function renderTickets(tickets) {

    const role = localStorage.getItem("role");
    const ticketList = document.getElementById("ticketList");

    if (!ticketList) return;

    if (!tickets || tickets.length === 0) {
        ticketList.innerHTML = `
            <div class="empty-state">
                Görüntülenecek ticket bulunamadı.
            </div>
        `;
        return;
    }

    const orderedTickets = [...tickets].sort((a, b) => {
        const aMeta = getSlaMeta(a);
        const bMeta = getSlaMeta(b);

        if (aMeta.critical !== bMeta.critical) {
            return aMeta.critical ? -1 : 1;
        }

        return new Date(a.created_at) - new Date(b.created_at);
    });

    ticketList.innerHTML = `
        <table class="ticket-table">

            <thead>
                <tr>
                    <th>No</th>
                    <th>Tür</th>
                    <th>Öncelik</th>
                    <th>Durum</th>
                    <th>Ekip</th>
                    <th>SLA</th>
                    <th>İşlem</th>
                </tr>
            </thead>

            <tbody>

            ${orderedTickets.map(ticket => {
                const slaMeta = getSlaMeta(ticket);
                return `

                <tr>
                    <td>${ticket.ticket_no}${slaMeta.critical ? ` <span class="sla-pill ${slaMeta.className}">SLA</span>` : ""}</td>

                    <td>${escapeHtml(issues[ticket.issue_type]?.category || ticket.issue_type)}</td>

                    <td>
                        <span class="priority-badge ${getPriorityClass(ticket.priority)}">
                            ${ticket.priority}
                        </span>
                    </td>

                    <td>
                        <span class="status-badge ${getStatusClass(ticket.status)}">
                            ${ticket.status}
                        </span>
                    </td>

                    <td>${ticket.assigned_department || "-"}</td>

                    <td>
                        <span class="sla-badge ${slaMeta.className}">
                            ${escapeHtml(slaMeta.label)}
                        </span>
                    </td>

                    <td>

                        <button onclick="showTicketDetail(${ticket.id})">
                            Aç
                        </button>

                        ${role === "admin" ? `
                            <button onclick="changeStatus(${ticket.id}, 'İnceleniyor')">
                                İncele
                            </button>

                            <button onclick="changeStatus(${ticket.id}, 'Çözüldü')">
                                Çöz
                            </button>

                            <button onclick="deleteTicket(${ticket.id})">
                                Sil
                            </button>
                        ` : ""}

                    </td>

                </tr>

            `;
            }).join("")}

            </tbody>

        </table>
    `;
}
async function loadTickets() {
    const dashboard = document.getElementById("dashboard");

    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    const role = localStorage.getItem("role");
    const username = localStorage.getItem("username");

    let visibleTickets = tickets;

    if (role === "user") {
        visibleTickets = tickets.filter(ticket =>
            ticket.created_by === username
        );
    }

    ticketListState = visibleTickets;

    if (dashboard) {
        const total = visibleTickets.length;
        const open = visibleTickets.filter(ticket => ticket.status === "Açık").length;
        const reviewing = visibleTickets.filter(ticket => ticket.status === "İnceleniyor").length;
        const solved = visibleTickets.filter(ticket => ticket.status === "Çözüldü").length;

        dashboard.innerHTML = `
            <div class="dashboard-card">
                <span>Toplam Ticket</span>
                <strong>${total}</strong>
            </div>

            <div class="dashboard-card open">
                <span>Açık</span>
                <strong>${open}</strong>
            </div>

            <div class="dashboard-card reviewing">
                <span>İnceleniyor</span>
                <strong>${reviewing}</strong>
            </div>

            <div class="dashboard-card solved">
                <span>Çözüldü</span>
                <strong>${solved}</strong>
            </div>
        `;
    }

    renderTickets(visibleTickets);
}

async function loadAllTickets() {
    const response = await fetch(`${API_URL}/tickets`);

    if (!response.ok) {
        alert("Ticketlar yüklenemedi.");
        return;
    }

    const tickets = await response.json();
    renderTickets(tickets);
}

function logout() {

    localStorage.clear();

    window.location.replace("login.html");

}
async function changeStatus(ticketId, newStatus) {
    const tickets = await fetch(`${API_URL}/tickets`).then(res => res.json());
    const ticket = tickets.find(t => t.id === ticketId);

    if (!ticket) {
        alert("Ticket bulunamadı.");
        return;
    }

    await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            status: newStatus,
            assigned_department: ticket.assigned_department,
            assigned_to: ticket.assigned_to,
            priority: ticket.priority
        })
    });

    loadTickets();
}
async function deleteTicket(ticketId) {
    await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: "DELETE"
    });

    loadTickets();
}
function searchTickets() {
    const searchValue = document.getElementById("searchInput").value.toLowerCase();

    let tickets = ticketListState || [];

    const filteredTickets = tickets.filter(ticket =>
        (ticket.ticket_no || "").toLowerCase().includes(searchValue) ||
        (ticket.issue_type || "").toLowerCase().includes(searchValue) ||
        (issues[ticket.issue_type]?.category || "").toLowerCase().includes(searchValue) ||
        (ticket.department || "").toLowerCase().includes(searchValue) ||
        (ticket.assigned_department || "").toLowerCase().includes(searchValue) ||
        (ticket.status || "").toLowerCase().includes(searchValue)
    );

    renderTickets(filteredTickets);
}
function filterTickets() {

    const selectedStatus =
        document.getElementById("statusFilter").value;

    let tickets = ticketListState || [];

    if (selectedStatus === "all") {
        renderTickets(tickets);
        return;
    }

    const filteredTickets =
        tickets.filter(ticket =>
            ticket.status === selectedStatus
        );

    renderTickets(filteredTickets);
}
function sortTickets() {
    const sortValue = document.getElementById("sortSelect").value;

    let tickets = [...(ticketListState || [])];

    if (sortValue === "newest") {
        tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    if (sortValue === "oldest") {
        tickets.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    if (sortValue === "priority") {
        const priorityOrder = {
            "Yüksek": 1,
            "Orta": 2,
            "Düşük-Orta": 3,
            "Düşük": 4
        };

        tickets.sort((a, b) =>
            priorityOrder[a.priority] - priorityOrder[b.priority]
        );
    }

    if (sortValue === "status") {
        const statusOrder = {
            "Açık": 1,
            "İnceleniyor": 2,
            "Çözüldü": 3
        };

        tickets.sort((a, b) =>
            statusOrder[a.status] - statusOrder[b.status]
        );
    }

    renderTickets(tickets);
}
function exportCSV() {
    let tickets = JSON.parse(localStorage.getItem("tickets")) || [];

    if (tickets.length === 0) {
        alert("Dışa aktarılacak ticket bulunamadı.");
        return;
    }

    let csvContent = "Ticket No,Ad Soyad,Departman,Kategori,Ekip,Öncelik,Durum,Oluşturulma,Son Güncelleme,Sorun Özeti\\n";

    tickets.forEach(ticket => {
        csvContent += `"${ticket.ticketNo}","${ticket.fullName}","${ticket.department}","${ticket.category}","${ticket.team}","${ticket.priority}","${ticket.status}","${ticket.createdAt}","${ticket.updatedAt}","${ticket.summary}"\\n`;
    });

    const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;"
    });

    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = "bank-it-service-desk-tickets.csv";

    link.click();
}
loadTickets();

async function viewTicket(ticketId) {
    const ticketDetail = document.getElementById("ticketDetail");

    const tickets = await fetch(`${API_URL}/tickets`).then(res => res.json());

    console.log("tickets:", tickets);
    console.log("ticketId:", ticketId); 

    const ticket = tickets.find(t => t.id === ticketId);
    console.log("found ticket:", ticket);

    if (!ticket) {
        ticketDetail.innerHTML = "<p>Ticket bulunamadı.</p>";
        return;
    }
    console.log("ticketDetail element:", ticketDetail);

    ticketDetail.innerHTML = `
        <div class="ticket-detail-card">

            <h2>${ticket.ticket_no}</h2>

            <p><strong>Ad Soyad:</strong> ${ticket.full_name}</p>

            <p><strong>Departman:</strong> ${ticket.department}</p>

            <p><strong>Kategori:</strong> ${ticket.category}</p>

            <p><strong>Ekip:</strong> ${ticket.team}</p>

            <p><strong>Öncelik:</strong> ${ticket.priority}</p>

            <p><strong>Durum:</strong> ${ticket.status}</p>

            <p><strong>Oluşturulma:</strong> ${ticket.created_at}</p>

            <p><strong>Son Güncelleme:</strong> ${ticket.updated_at}</p>

            <p><strong>Sorun Özeti:</strong></p>
            <p>${ticket.description}</p>

            <button onclick="editTicket(${ticket.id})">
                Ticket Düzenle
            </button>

        </div>
    `;
    ticketDetail.innerHTML = `
    <div class="ticket-detail-card">
        <h2>${ticket.ticket_no}</h2>
        <p><strong>Ad Soyad:</strong> ${ticket.full_name}</p>
        <p><strong>Departman:</strong> ${ticket.department}</p>
        <p><strong>Kategori:</strong> ${ticket.category}</p>
        <p><strong>Ekip:</strong> ${ticket.team}</p>
        <p><strong>Öncelik:</strong> ${ticket.priority}</p>
        <p><strong>Durum:</strong> ${ticket.status}</p>
        <p><strong>Oluşturulma:</strong> ${ticket.created_at}</p>
        <p><strong>Son Güncelleme:</strong> ${ticket.updated_at}</p>
        <p><strong>Sorun Özeti:</strong></p>
        <p>${ticket.summary}</p>

        ${localStorage.getItem("role") === "admin" ? `
            <button onclick="editTicket(${ticket.id})">
                 Ticket Düzenle
            </button>
`       : ""}
    </div>
`;

    ticketDetail.scrollIntoView({ behavior: "smooth" });
    console.log("detail html:", ticketDetail.innerHTML);
}
async function editTicket(ticketId) {
    const ticketDetail = document.getElementById("ticketDetail");

    const tickets = await fetch(`${API_URL}/tickets`).then(res => res.json());

    const ticket = tickets.find(t => t.id === ticketId);

    if (!ticket) {
        ticketDetail.innerHTML = "<p>Ticket bulunamadı.</p>";
        return;
    }

    ticketDetail.innerHTML = `
        <div class="ticket-detail-card">
            <h2>Ticket Düzenle - ${ticket.ticket_no}</h2>

            <input type="text" id="editFullName" value="${ticket.full_name}">

            <input type="text" id="editDepartment" value="${ticket.department}">

            <textarea id="editSummary">${ticket.summary}</textarea>

            <select id="editStatus">
                <option value="Açık" ${ticket.status === "Açık" ? "selected" : ""}>Açık</option>
                <option value="İnceleniyor" ${ticket.status === "İnceleniyor" ? "selected" : ""}>İnceleniyor</option>
                <option value="Çözüldü" ${ticket.status === "Çözüldü" ? "selected" : ""}>Çözüldü</option>
            </select>

            <button onclick="saveTicketEdit(${ticket.id})">
                Kaydet
            </button>
        </div>
    `;
}

async function saveTicketEdit(ticketId) {
    const updatedTicket = {
        full_name: document.getElementById("editFullName").value,
        department: document.getElementById("editDepartment").value,
        summary: document.getElementById("editSummary").value,
        status: document.getElementById("editStatus").value,
        updated_at: new Date().toLocaleString("tr-TR")
    };

    await fetch(`${API_URL}/tickets/${ticketId}`, {
        method: "PUT",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(updatedTicket)
    });

    loadTickets();
    viewTicket(ticketId);
}

function filterByCategory() {

    const selectedCategory =
        document.getElementById("categoryFilter").value;

    let tickets = ticketListState || [];

    if (selectedCategory === "all") {
        renderTickets(tickets);
        return;
    }

    const filteredTickets =
        tickets.filter(ticket =>
            ticket.assigned_department === selectedCategory
        );

    renderTickets(filteredTickets);
}
async function loadReports() {
    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    generateCategoryReport(tickets);
    generateStatusReport(tickets);
    generatePriorityReport(tickets);
    generateManagerSummary(tickets);
    generateDepartmentReport(tickets);
    generateCriticalReport(tickets);
    generateRecentTicketsReport(tickets);
    generateTeamWorkloadReport(tickets);
}

function generateCategoryReport(tickets) {
    const report = document.getElementById("categoryReport");

    if (!report) return;

    const categoryCount = {};

    tickets.forEach(ticket => {
        categoryCount[ticket.category] =
            (categoryCount[ticket.category] || 0) + 1;
    });

    let html = "";

    for (const category in categoryCount) {
        html += `
            <p>
                <strong>${category}</strong> :
                ${categoryCount[category]}
            </p>
        `;
    }

    report.innerHTML = `
        <div class="report-card">
            <h3>Kategori Dağılımı</h3>
            ${html}
            <button onclick="openReportDetail('category')">
                İncele
            </button>
        </div>
    `;
}

function generateStatusReport(tickets) {
    
    const report =
        document.getElementById("statusReport");
    if (!report) return;

    let open = 0;
    let reviewing = 0;
    let solved = 0;

    tickets.forEach(ticket => {

        if (ticket.status === "Açık") {
            open++;
        }

        if (ticket.status === "İnceleniyor") {
            reviewing++;
        }

        if (ticket.status === "Çözüldü") {
            solved++;
        }

    });

    const solutionRate =
        tickets.length > 0
            ? ((solved / tickets.length) * 100).toFixed(1)
            : 0;

    report.innerHTML = `
        <div class="report-card">

            <h3>Durum Dağılımı</h3>

            <p><strong>Açık:</strong> ${open}</p>

            <p><strong>İnceleniyor:</strong> ${reviewing}</p>

            <p><strong>Çözüldü:</strong> ${solved}</p>

            <hr>

            <p>
                <strong>Çözüm Oranı:</strong>
                %${solutionRate}
            </p>
            <button onclick="openReportDetail('status')">
                İncele
            </button>

        </div>
    `;
}

function generatePriorityReport(tickets) {
    
    const report =
        document.getElementById("priorityReport");
    if (!report) return;
    let high = 0;
    let medium = 0;
    let low = 0;

    tickets.forEach(ticket => {

        if (ticket.priority === "Yüksek") {
            high++;
        }

        if (
            ticket.priority === "Orta" ||
            ticket.priority === "Düşük-Orta"
        ) {
            medium++;
        }

        if (ticket.priority === "Düşük") {
            low++;
        }

    });

    let riskLevel = "Düşük";

    if (high >= 5) {
        riskLevel = "Yüksek";
    }
    else if (high >= 2) {
        riskLevel = "Orta";
    }

    report.innerHTML = `
        <div class="report-card">

            <h3>Öncelik Dağılımı</h3>

            <p><strong>Yüksek:</strong> ${high}</p>

            <p><strong>Orta:</strong> ${medium}</p>

            <p><strong>Düşük:</strong> ${low}</p>

            <hr>

            <p>
                <strong>Risk Seviyesi:</strong>
                ${riskLevel}
            </p>
            <button onclick="openReportDetail('priority')">
                İncele
            </button>

        </div>
    `;
}

function generateManagerSummary(tickets) {
    
    const report =
        document.getElementById("managerSummary");

    const totalTickets = tickets.length;

    const solvedTickets =
        tickets.filter(ticket =>
            ticket.status === "Çözüldü"
        ).length;

    const highPriorityTickets =
        tickets.filter(ticket =>
            ticket.priority === "Yüksek"
        ).length;

    const categoryCount = {};
    if (!report) return;

    tickets.forEach(ticket => {

        categoryCount[ticket.category] =
            (categoryCount[ticket.category] || 0) + 1;

    });

    let mostUsedCategory = "-";
    let maxCount = 0;

    for (const category in categoryCount) {

        if (categoryCount[category] > maxCount) {

            maxCount = categoryCount[category];

            mostUsedCategory = category;
        }
    }

    const solutionRate =
        totalTickets > 0
            ? ((solvedTickets / totalTickets) * 100).toFixed(1)
            : 0;

    report.innerHTML = `
        <div class="report-card">

            <h3>Yönetici Özeti</h3>

            <p>
                Bu dönemde toplam
                <strong>${totalTickets}</strong>
                ticket oluşturulmuştur.
            </p>

            <p>
                En yoğun kategori
                <strong>${mostUsedCategory}</strong>
                kategorisidir.
            </p>

            <p>
                Ticketların
                <strong>%${solutionRate}</strong>
                kısmı çözüme ulaşmıştır.
            </p>

            <p>
                Açık yüksek öncelikli ticket sayısı
                <strong>${highPriorityTickets}</strong>
                olarak hesaplanmıştır.
            </p>
            <button onclick="openReportDetail('manager')">
                İncele
            </button>

        </div>
    `;
}
loadReports();
function generateDepartmentReport(tickets) {
   
    generateCriticalReport(tickets);

    generateRecentTicketsReport(tickets);

    generateTeamWorkloadReport(tickets);
    

    const report =
        document.getElementById("departmentReport");

    const departmentCount = {};

    tickets.forEach(ticket => {

        departmentCount[ticket.department] =
            (departmentCount[ticket.department] || 0) + 1;

    });

    const sortedDepartments =
        Object.entries(departmentCount)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);

    let html = "";

    if (!report) return;

    sortedDepartments.forEach((department, index) => {

        html += `
            <p>
                ${index + 1}.
                <strong>${department[0]}</strong>
                (${department[1]})
            </p>
        `;
    });

    report.innerHTML = `
        <div class="report-card">

            <h3>
                En Çok Ticket Açan Departmanlar
            </h3>

            ${html}
            <button onclick="openReportDetail('department')">
                İncele
            </button>

        </div>
    `;
}
function generateCriticalReport(tickets) {
    
    const report = document.getElementById("criticalReport");

    const criticalTickets = tickets.filter(ticket =>
        ticket.priority === "Yüksek" &&
        ticket.status !== "Çözüldü"
    );
    if (!report) return;

    report.innerHTML = `
        <div class="report-card">
            <h3>Kritik Açık Ticketlar</h3>

            <p>
                Çözülmemiş yüksek öncelikli ticket sayısı:
                <strong>${criticalTickets.length}</strong>
            </p>
            <button onclick="openReportDetail('critical')">
                İncele
            </button>
        </div>
    `;
}

function generateRecentTicketsReport(tickets) {
    
    const report = document.getElementById("recentTicketsReport");

    const recentTickets = tickets
        .slice()
        .reverse()
        .slice(0, 5);

    let html = "";
    if (!report) return;

    recentTickets.forEach(ticket => {
        html += `
            <p>
                <strong>${ticket.ticketNo}</strong>
                - ${ticket.category}
                - ${ticket.status}
            </p>
        `;
    });

    report.innerHTML = `
        <div class="report-card">
            <h3>Son Oluşturulan Ticketlar</h3>

            ${html || "<p>Henüz ticket bulunmuyor.</p>"}
            <button onclick="openReportDetail('recent')">
                İncele
            </button>
        </div>
    `;
}

function generateTeamWorkloadReport(tickets) {
   
    const report = document.getElementById("teamWorkloadReport");

    const teamCount = {};

    tickets.forEach(ticket => {
        teamCount[ticket.team] =
            (teamCount[ticket.team] || 0) + 1;
    });

    let busiestTeam = "-";
    let maxCount = 0;
    if (!report) return;

    for (const team in teamCount) {
        if (teamCount[team] > maxCount) {
            maxCount = teamCount[team];
            busiestTeam = team;
        }
    }

    report.innerHTML = `
        <div class="report-card">
            <h3>En Yoğun Ekip</h3>

            <p>
                En fazla ticket yönlendirilen ekip:
                <strong>${busiestTeam}</strong>
            </p>

            <p>
                Ticket sayısı:
                <strong>${maxCount}</strong>
            </p>
            <button onclick="openReportDetail('team')">
                İncele
            </button>
        </div>
    `;
}

async function filterAdminTickets(status) {
    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    const filteredTickets = tickets.filter(ticket =>
        ticket.status === status
    );

    renderTickets(filteredTickets);
}


async function testApiConnection() {
    const response = await fetch(`${API_URL}/tickets`);
    const data = await response.json();

    console.log(data);
}


async function loadTicketsFromApi() {
    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    renderTickets(tickets);
}

if (document.getElementById("ticketList")) {
    loadTickets();
}

if (document.getElementById("reportsSection")) {
    loadReports();
}

async function loadDashboard() {

    const [ticketsResponse, requestsResponse] = await Promise.all([
        fetch(`${API_URL}/tickets`),
        fetch(`${API_URL}/requests`)
    ]);

    adminDashboardState.tickets = await ticketsResponse.json();
    adminDashboardState.requests = await requestsResponse.json();

    renderAdminDashboard();
}

function isCriticalTicket(ticket) {
    if (ticket.status === "Çözüldü") return false;
    if (!ticket.created_at || !ticket.sla_hours) return false;

    const createdDate = new Date(ticket.created_at);
    const deadline = new Date(createdDate.getTime() + (ticket.sla_hours * 60 * 60 * 1000));
    const hoursLeft = (deadline - new Date()) / (1000 * 60 * 60);

    return hoursLeft <= 2;
}

function getFilteredAdminTickets() {
    const { tickets, filter } = adminDashboardState;

    if (filter === "tickets-open") {
        return tickets.filter(ticket => ticket.status !== "Çözüldü");
    }

    if (filter === "tickets-critical") {
        return tickets.filter(isCriticalTicket);
    }

    if (["MS", "Network", "Technical"].includes(filter)) {
        return tickets.filter(ticket => ticket.assigned_department === filter);
    }

    return tickets;
}

function getFilteredAdminRequests() {
    const { requests, filter } = adminDashboardState;

    let filtered = requests;

    if (filter === "requests-pending") {
        filtered = requests.filter(request => request.approval_status === "Onay Bekliyor");
    }

    if (["MS", "Network", "Technical"].includes(filter)) {
        filtered = filtered.filter(request => request.assigned_department === filter);
    }

    return filtered;
}

function setAdminQueueFilter(filter) {
    adminDashboardState.filter = filter;

    document.querySelectorAll(".filter-chip").forEach(button => {
        button.classList.toggle("active", button.dataset.filter === filter);
    });

    renderAdminDashboard();
}

function renderAdminDashboard() {
    const dashboard = document.getElementById("dashboard");
    const alerts = document.getElementById("adminAlerts");
    const queues = document.getElementById("adminQueues");

    if (!dashboard) return;

    const tickets = adminDashboardState.tickets;
    const requests = adminDashboardState.requests;
    const filter = adminDashboardState.filter;

    document.querySelectorAll(".filter-chip").forEach(button => {
        button.classList.toggle("active", button.dataset.filter === filter);
    });

    const total = tickets.length;
    const open = tickets.filter(t => t.status === "Açık").length;
    const reviewing = tickets.filter(t => t.status === "İnceleniyor").length;
    const solved = tickets.filter(t => t.status === "Çözüldü").length;
    const pendingRequests = requests.filter(
        request => request.approval_status === "Onay Bekliyor"
    ).length;
    const criticalTickets = tickets.filter(isCriticalTicket);

    dashboard.innerHTML = `
        <div class="dashboard-card">
            <span>Toplam Ticket</span>
            <strong>${total}</strong>
        </div>
        <div class="dashboard-card open">
            <span>Açık</span>
            <strong>${open}</strong>
        </div>
        <div class="dashboard-card reviewing">
            <span>İnceleniyor</span>
            <strong>${reviewing}</strong>
        </div>
        <div class="dashboard-card solved">
            <span>Çözüldü</span>
            <strong>${solved}</strong>
        </div>
    `;

    if (alerts) {
        alerts.innerHTML = `
            <div class="report-card admin-alert-card">
                <h3>Kritik Uyarılar</h3>
                <p><strong>Kritik SLA:</strong> ${criticalTickets.length}</p>
                <p><strong>Onay Bekleyen Request:</strong> ${pendingRequests}</p>
                <button onclick="window.location.href='admin-tickets.html'">Çağrıları Aç</button>
            </div>
        `;
    }

    if (queues) {
        const filteredTickets = getFilteredAdminTickets()
            .sort((a, b) => {
                const aMeta = getSlaMeta(a);
                const bMeta = getSlaMeta(b);

                if (aMeta.critical !== bMeta.critical) {
                    return aMeta.critical ? -1 : 1;
                }

                return new Date(a.created_at) - new Date(b.created_at);
            })
            .slice(0, 5);

        const filteredRequests = getFilteredAdminRequests()
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
            .slice(0, 5);

        const ticketsTitle = filter === "tickets-critical"
            ? "Kritik SLA Ticketlar"
            : filter === "tickets-open"
                ? "Açık Ticketlar"
                : ["MS", "Network", "Technical"].includes(filter)
                    ? `${filter} Ticketlar`
                    : "Son Açık Çağrılar";

        const requestsTitle = filter === "requests-pending"
            ? "Bekleyen Requestler"
            : ["MS", "Network", "Technical"].includes(filter)
                ? `${filter} Requestler`
                : "Bekleyen Requestler";

        queues.innerHTML = `
            <div class="report-card admin-queue-card">
                <h3>${ticketsTitle}</h3>
                <table class="ticket-table admin-queue-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Tür</th>
                            <th>Durum</th>
                            <th>SLA</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredTickets.map(ticket => {
                            const slaMeta = getSlaMeta(ticket);
                            return `
                            <tr class="${slaMeta.className !== "sla-ok" ? "sla-row" : ""}">
                                <td>${escapeHtml(ticket.ticket_no)}</td>
                                <td>${escapeHtml(ticket.issue_type)}</td>
                                <td>
                                    <span class="status-badge ${getStatusClass(ticket.status)}">${escapeHtml(ticket.status)}</span>
                                </td>
                                <td>
                                    <span class="sla-badge ${slaMeta.className}">
                                        ${escapeHtml(slaMeta.label)}
                                    </span>
                                </td>
                            </tr>
                        `;
                        }).join("") || `<tr><td colspan="4">Kayıt bulunamadı.</td></tr>`}
                    </tbody>
                </table>
                <button onclick="window.location.href='admin-tickets.html'">Tüm Çağrılar</button>
            </div>

            <div class="report-card admin-queue-card">
                <h3>${requestsTitle}</h3>
                <table class="ticket-table admin-queue-table">
                    <thead>
                        <tr>
                            <th>No</th>
                            <th>Tür</th>
                            <th>Durum</th>
                            <th>Birim</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredRequests.map(request => `
                            <tr>
                                <td>${escapeHtml(request.request_no)}</td>
                                <td>${escapeHtml(request.request_type)}</td>
                                <td>
                                    <span class="status-badge ${request.approval_status === "Onay Bekliyor" ? "status-reviewing" : "status-solved"}">${escapeHtml(request.approval_status)}</span>
                                </td>
                                <td>${escapeHtml(request.assigned_department || "-")}</td>
                            </tr>
                        `).join("") || `<tr><td colspan="4">Kayıt bulunamadı.</td></tr>`}
                    </tbody>
                </table>
                <button onclick="window.location.href='admin-requests.html'">Tüm Requestler</button>
            </div>
        `;
    }
}

async function loadStaffTickets() {
    const username = localStorage.getItem("username");

    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    const assignedTickets = tickets.filter(ticket =>
        ticket.assigned_to === username
    );

    renderTickets(assignedTickets);
}

async function showTicketDetail(ticketId) {

    try {

        const response =
            await fetch(`${API_URL}/tickets/${ticketId}`);

        const ticket =
            await response.json();

        const detail =
            document.getElementById("ticketDetail");

        detail.innerHTML = `
            <div class="ticket-detail-card">

                <div class="detail-header">

                    <h3>${ticket.ticket_no}</h3>

                    <button class="close-detail-btn"
                            onclick="closeTicketDetail()">
                        ✕
                    </button>

                </div>

                <p><strong>Kategori:</strong>
                ${ticket.issue_type}</p>

                <p><strong>Kullanıcı:</strong>
                ${ticket.full_name}</p>

                <p><strong>Departman:</strong>
                ${ticket.department}</p>

                <p><strong>Öncelik:</strong>
                ${ticket.priority}</p>

                <p><strong>Durum:</strong>
                ${ticket.status}</p>

                <p><strong>Atanan Ekip:</strong>
                ${ticket.assigned_department || "-"}</p>

                <p><strong>SLA:</strong>
                ${ticket.sla_hours || "-"} Saat</p>

                <p><strong>Açıklama:</strong></p>

                <p>${ticket.description}</p>

                <hr>

                <h3>Timeline</h3>
                <div id="ticketTimeline"></div>

                <hr>

                <h3>Mesajlaşma</h3>

                <div id="ticketMessages"></div>

                <textarea
                    id="newMessage"
                    placeholder="Mesaj yaz..."
                ></textarea>

                <button onclick="sendMessage(${ticket.id})">
                    Gönder
                </button>

            </div>
        `;

        await loadTimeline("tickets", ticket.id, "ticketTimeline");
        await loadTicketMessages(ticket.id);

        detail.scrollIntoView({
            behavior: "smooth"
        });

    } catch (error) {

        console.error(error);

        alert("Ticket detayı yüklenemedi.");
    }
}

function closeTicketDetail() {
    const detail = document.getElementById("ticketDetail");

    if (detail) {
        detail.innerHTML = "";
    }
}

async function loadTicketMessages(ticketId) {
    const messagesContainer = document.getElementById("ticketMessages");

    if (!messagesContainer) return;

    try {
        const response = await fetch(`${API_URL}/tickets/${ticketId}/messages`);

        if (!response.ok) {
            throw new Error("Mesajlar yüklenemedi");
        }

        const messages = await response.json();

        if (messages.length === 0) {
            messagesContainer.innerHTML = "<p>Henüz mesaj yok.</p>";
            return;
        }

        messagesContainer.innerHTML = messages.map(message => `
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
        messagesContainer.innerHTML = "<p>Mesajlar yüklenemedi.</p>";
    }
}

async function sendMessage(ticketId) {
    const messageInput = document.getElementById("newMessage");
    const body = messageInput ? messageInput.value.trim() : "";

    if (!body) {
        alert("Mesaj yazın.");
        return;
    }

    const currentUser = JSON.parse(localStorage.getItem("currentUser") || "{}");
    const senderName =
        currentUser.full_name ||
        localStorage.getItem("username") ||
        "Bilinmeyen";
    const senderRole =
        currentUser.role ||
        localStorage.getItem("role") ||
        "user";

    const response = await fetch(`${API_URL}/tickets/${ticketId}/messages`, {
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

    messageInput.value = "";
    await loadTicketMessages(ticketId);
    await loadTimeline("tickets", ticketId, "ticketTimeline");
}





function loadConversations(tickets){

    document.getElementById(
        "conversationList"
    ).innerHTML = tickets.map(ticket => `

        <div
        class="conversation-item"
        onclick="openConversation(${ticket.id})">

            ${ticket.ticket_no}

            <br>

            <small>
                ${ticket.issue_type}
            </small>

        </div>

    `).join("");

}
if (document.getElementById("ticketList")) {
    loadTickets();
}
function openReportDetail(reportType) {
    window.location.href = `admin-report-detail.html?type=${reportType}`;
}

async function loadReportDetail() {
    const params = new URLSearchParams(window.location.search);
    const type = params.get("type");

    const response = await fetch(`${API_URL}/tickets`);
    const tickets = await response.json();

    const title = document.getElementById("reportTitle");
    const description = document.getElementById("reportDescription");
    const content = document.getElementById("reportDetailContent");

    if (type === "category") {
        title.innerText = "Kategori Analizi";
        description.innerText = "Ticketların kategori bazlı dağılımı.";

        renderSimpleBarChart(content, tickets, "category");
    }

    else if (type === "status") {
        title.innerText = "Durum Analizi";
        description.innerText = "Açık, incelenen ve çözülen çağrıların dağılımı.";

        renderSimpleBarChart(content, tickets, "status");
    }

    else if (type === "priority") {
        title.innerText = "Öncelik Analizi";
        description.innerText = "Ticketların öncelik seviyelerine göre dağılımı.";

        renderSimpleBarChart(content, tickets, "priority");
    }

    else if (type === "department") {
        title.innerText = "Departman Analizi";
        description.innerText = "Banka departmanlarından gelen ticket yoğunluğu.";

        renderSimpleBarChart(content, tickets, "department");
    }

    else if (type === "team") {
        title.innerText = "IT Ekip İş Yükü";
        description.innerText = "Ticketların IT ekiplerine göre dağılımı.";

        renderSimpleBarChart(content, tickets, "assigned_department");
    }

    else {
        title.innerText = "Rapor Bulunamadı";
        description.innerText = "Geçerli bir rapor tipi seçilmedi.";
    }
}

function renderSimpleBarChart(container, tickets, fieldName) {
    const counts = {};

    tickets.forEach(ticket => {
        const key = ticket[fieldName] || "Belirtilmemiş";
        counts[key] = (counts[key] || 0) + 1;
    });

    const maxValue = Math.max(...Object.values(counts), 1);

    let html = `
        <div class="report-card">
            <h3>Grafik</h3>
    `;

    for (const key in counts) {
        const width = (counts[key] / maxValue) * 100;

        html += `
            <div class="chart-row">
                <div class="chart-label">
                    ${key} (${counts[key]})
                </div>

                <div class="chart-bar-bg">
                    <div class="chart-bar-fill" style="width: ${width}%"></div>
                </div>
            </div>
        `;
    }

    html += `
        </div>
    `;

    container.innerHTML = html;
}
