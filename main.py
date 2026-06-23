import os

from fastapi import FastAPI, Depends, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from schemas import TicketCreate, TicketUpdate, UserCreate, UserLogin

import models
import schemas
from database import SessionLocal, engine, DATABASE_BACKEND


app = FastAPI(title="Bank IT Service Desk API")

AUTO_CREATE_SCHEMA = os.getenv("AUTO_CREATE_SCHEMA", "1") != "0"

if AUTO_CREATE_SCHEMA:
    models.Base.metadata.create_all(bind=engine)

SECRET_KEY = "dev-change-this-secret-key-before-production"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 480
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def ensure_sqlite_columns():
    if DATABASE_BACKEND != "sqlite":
        return

    with engine.begin() as connection:
        timeline_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(timeline_events)"))
        }

        if timeline_columns:
            required_columns = {
                "item_type": "VARCHAR",
                "item_id": "INTEGER",
                "event_type": "VARCHAR",
                "description": "TEXT",
                "created_by": "VARCHAR",
                "created_at": "DATETIME"
            }

            for column_name, column_type in required_columns.items():
                if column_name not in timeline_columns:
                    connection.execute(
                        text(f"ALTER TABLE timeline_events ADD COLUMN {column_name} {column_type}")
                    )

        ai_report_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(ai_agent_reports)"))
        }

        if ai_report_columns:
            required_ai_columns = {
                "item_type": "VARCHAR",
                "item_id": "INTEGER",
                "item_no": "VARCHAR",
                "selected_issue_type": "VARCHAR",
                "original_department": "VARCHAR",
                "suggested_department": "VARCHAR",
                "action": "VARCHAR",
                "reason": "TEXT",
                "confidence": "INTEGER",
                "data_scope": "VARCHAR",
                "created_at": "DATETIME"
            }

            for column_name, column_type in required_ai_columns.items():
                if column_name not in ai_report_columns:
                    connection.execute(
                        text(f"ALTER TABLE ai_agent_reports ADD COLUMN {column_name} {column_type}")
                    )

        kb_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(knowledge_articles)"))
        }

        if kb_columns:
            required_kb_columns = {
                "title": "VARCHAR",
                "category": "VARCHAR",
                "keywords": "TEXT",
                "content": "TEXT",
                "solution_steps": "TEXT",
                "is_active": "INTEGER",
                "created_at": "DATETIME",
                "updated_at": "DATETIME"
            }

            for column_name, column_type in required_kb_columns.items():
                if column_name not in kb_columns:
                    connection.execute(
                        text(f"ALTER TABLE knowledge_articles ADD COLUMN {column_name} {column_type}")
                    )

        audit_columns = {
            row[1] for row in connection.execute(text("PRAGMA table_info(audit_logs)"))
        }

        if audit_columns:
            required_audit_columns = {
                "actor_username": "VARCHAR",
                "actor_name": "VARCHAR",
                "actor_role": "VARCHAR",
                "action": "VARCHAR",
                "item_type": "VARCHAR",
                "item_id": "INTEGER",
                "item_no": "VARCHAR",
                "details": "TEXT",
                "created_at": "DATETIME"
            }

            for column_name, column_type in required_audit_columns.items():
                if column_name not in audit_columns:
                    connection.execute(
                        text(f"ALTER TABLE audit_logs ADD COLUMN {column_name} {column_type}")
                    )


ensure_sqlite_columns()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_password_hash(value: str):
    return bool(value and value.startswith("$2"))


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(plain_password: str, stored_password: str):
    if not stored_password:
        return False

    if is_password_hash(stored_password):
        return pwd_context.verify(plain_password, stored_password)

    return plain_password == stored_password


def create_access_token(data: dict, expires_delta: timedelta = None):
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(
    authorization: str = Header(default=None),
    db: Session = Depends(get_db)
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Kimlik doğrulama gerekli")

    token = authorization.replace("Bearer ", "", 1).strip()

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Geçersiz veya süresi dolmuş token")

    if not username:
        raise HTTPException(status_code=401, detail="Geçersiz token")

    user = db.query(models.User).filter(models.User.username == username).first()

    if not user:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")

    return user


def require_roles(*allowed_roles: str):
    def role_guard(current_user: models.User = Depends(get_current_user)):
        if current_user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Bu işlem için yetki yok")

        return current_user

    return role_guard


@app.get("/")
def home():
    return {"message": "Bank IT Service Desk API çalışıyor"}

TICKET_ROUTING = {
    "outlook": "MS",
    "email_delivery": "MS",
    "teams": "MS",
    "password": "MS",
    "mfa": "MS",
    "account_access": "MS",
    "onedrive": "MS",
    "sharepoint": "MS",
    "office_apps": "MS",
    "mailbox_quota": "MS",
    "distribution_group": "MS",
    "calendar": "MS",
    "vpn": "Network",
    "internet": "Network",
    "wifi": "Network",
    "lan": "Network",
    "dns": "Network",
    "network_drive": "Network",
    "internal_app_access": "Network",
    "slow_network": "Network",
    "printer_network": "Network",
    "voip": "Network",
    "laptop": "Technical",
    "desktop": "Technical",
    "monitor": "Technical",
    "keyboard_mouse": "Technical",
    "printer": "Technical",
    "scanner": "Technical",
    "peripheral": "Technical",
    "mobile_device": "Technical",
    "pos_atm_device": "Technical",
    "software_install": "Technical"
}
REQUEST_ROUTING = {
    "Monitör Talebi": "Technical",
    "Mouse Talebi": "Technical",
    "Klavye Talebi": "Technical",
    "Laptop Talebi": "Technical",
    "Docking Station Talebi": "Technical",
    "Kulaklık/Kamera Talebi": "Technical",
    "Yazıcı/Tarayıcı Talebi": "Technical",
    "Mobil Cihaz Talebi": "Technical",
    "Yazılım Talebi": "MS",
    "Lisans Talebi": "MS",
    "Yetki Talebi": "MS",
    "Ortak Mailbox Talebi": "MS",
    "Dağıtım Grubu Talebi": "MS",
    "Dosya Paylaşım Alanı Talebi": "MS",
    "VPN Yetkisi": "Network",
    "Statik IP Talebi": "Network",
    "Network Port Aktivasyonu": "Network",
    "Firewall Erişim Talebi": "Network",
    "Uygulama Erişim Talebi": "Network"
}
TICKET_PRIORITY = {
    "vpn": "Yüksek",
    "password": "Yüksek",
    "mfa": "Yüksek",
    "account_access": "Yüksek",
    "internet": "Yüksek",
    "lan": "Yüksek",
    "internal_app_access": "Yüksek",
    "pos_atm_device": "Yüksek",
    "outlook": "Orta",
    "email_delivery": "Orta",
    "teams": "Orta",
    "sharepoint": "Orta",
    "office_apps": "Orta",
    "dns": "Orta",
    "network_drive": "Orta",
    "slow_network": "Orta",
    "printer_network": "Orta",
    "voip": "Orta",
    "laptop": "Orta",
    "desktop": "Orta",
    "printer": "Orta",
    "software_install": "Orta",
    "onedrive": "Düşük-Orta",
    "mailbox_quota": "Düşük-Orta",
    "distribution_group": "Düşük-Orta",
    "calendar": "Düşük-Orta",
    "wifi": "Düşük-Orta",
    "monitor": "Düşük-Orta",
    "keyboard_mouse": "Düşük-Orta",
    "scanner": "Düşük-Orta",
    "peripheral": "Düşük-Orta",
    "mobile_device": "Düşük-Orta"
}

REQUEST_PRIORITY = {
    "Monitör Talebi": "Düşük",
    "Mouse Talebi": "Düşük",
    "Klavye Talebi": "Düşük",
    "Laptop Talebi": "Orta",
    "Docking Station Talebi": "Düşük-Orta",
    "Kulaklık/Kamera Talebi": "Düşük",
    "Yazıcı/Tarayıcı Talebi": "Düşük-Orta",
    "Mobil Cihaz Talebi": "Orta",
    "Yazılım Talebi": "Orta",
    "Lisans Talebi": "Orta",
    "Yetki Talebi": "Yüksek",
    "Ortak Mailbox Talebi": "Orta",
    "Dağıtım Grubu Talebi": "Düşük-Orta",
    "Dosya Paylaşım Alanı Talebi": "Orta",
    "VPN Yetkisi": "Yüksek",
    "Statik IP Talebi": "Orta",
    "Network Port Aktivasyonu": "Orta",
    "Firewall Erişim Talebi": "Yüksek",
    "Uygulama Erişim Talebi": "Yüksek"
}
TICKET_SLA = {
    "vpn": 4,
    "password": 4,
    "mfa": 4,
    "account_access": 4,
    "internet": 4,
    "lan": 4,
    "internal_app_access": 4,
    "pos_atm_device": 4,
    "outlook": 24,
    "email_delivery": 24,
    "teams": 24,
    "sharepoint": 24,
    "office_apps": 24,
    "dns": 8,
    "network_drive": 8,
    "slow_network": 24,
    "printer_network": 24,
    "voip": 8,
    "laptop": 24,
    "desktop": 24,
    "printer": 24,
    "software_install": 24,
    "onedrive": 72,
    "mailbox_quota": 72,
    "distribution_group": 72,
    "calendar": 72,
    "wifi": 24,
    "monitor": 72,
    "keyboard_mouse": 72,
    "scanner": 72,
    "peripheral": 72,
    "mobile_device": 72
}

AI_AGENT_DATA_SCOPE = "selected_issue_type + description_keyword_signals_only"
AI_AGENT_RULES = {
    "Network": {
        "keywords": [
            "internet", "ağ", "network", "wifi", "wi-fi", "kablosuz",
            "wireless", "lan", "ethernet", "kablo", "port", "switch",
            "bağlantı", "baglanti", "bağlanamıyorum", "baglanamiyorum",
            "kopuyor", "kopma", "kesiliyor", "dns", "ip", "dhcp",
            "modem", "router", "switch", "ping", "vpn", "uzak erişim",
            "uzak erisim", "firewall", "erişemiyorum", "erisemiyorum",
            "paylaşım klasörü", "paylasim klasoru", "network drive",
            "ortak klasör", "ortak klasor", "ses kesiliyor", "telefon",
            "voip", "santral", "iç sistem", "ic sistem", "core banking"
        ],
        "reason": "Açıklama ağ, internet, bağlantı veya uzak erişim sinyalleri içeriyor."
    },
    "MS": {
        "keywords": [
            "outlook", "teams", "mail", "e-posta", "eposta", "posta",
            "email", "e mail", "mailbox", "posta kutusu", "takvim",
            "calendar", "toplantı", "toplanti", "meeting", "şifre", "sifre",
            "parola", "password", "hesap", "account", "kilit", "kilitlendi",
            "login", "log in", "giriş", "giris", "oturum", "mfa", "otp",
            "authenticator", "doğrulama", "dogrulama", "onedrive", "one drive",
            "sharepoint", "office", "excel", "word", "powerpoint", "ppt",
            "lisans", "license", "dağıtım grubu", "dagitim grubu",
            "distribution", "ortak mailbox", "shared mailbox"
        ],
        "reason": "Açıklama Microsoft 365, hesap, parola, lisans veya uygulama sinyalleri içeriyor."
    },
    "Technical": {
        "keywords": [
            "monitör", "monitor", "ekran", "mouse", "fare", "klavye",
            "keyboard", "yazıcı", "yazici", "printer", "tarayıcı", "tarayici",
            "scanner", "bilgisayar", "pc", "masaüstü", "masaustu", "desktop",
            "laptop", "notebook", "donanım", "donanim", "cihaz", "kamera",
            "webcam", "kulaklık", "kulaklik", "headset", "adaptör", "adapter",
            "dock", "docking", "batarya", "pil", "şarj", "sarj", "ısınma",
            "isinma", "kırıldı", "kirildi", "bozuk", "arızalı", "arizali",
            "pos", "atm", "token", "kart okuyucu", "card reader", "kurulum",
            "install", "yükleme", "yukleme"
        ],
        "reason": "Açıklama donanım, çevre birimi veya fiziksel cihaz sinyalleri içeriyor."
    }
}

KB_DATA_SCOPE = "local_knowledge_articles_only"
SENSITIVE_PATTERNS = [
    "@",
    "password",
    "parola:",
    "şifre:",
    "sifre:",
    "tckn",
    "tc kimlik",
    "iban",
    "kart no"
]
KB_STOPWORDS = {
    "bir", "ve", "ile", "için", "icin", "ama", "fakat", "sorun", "sorunu",
    "problem", "problemi", "hata", "hatası", "hatasi", "var", "yok", "olan",
    "gelen", "aldım", "aldim", "yaşıyorum", "yasiyorum", "çalışmıyor",
    "calismiyor", "olmuyor", "ediyorum", "yardım", "yardim", "lütfen",
    "lutfen", "bilinmeyen"
}


def normalize_search_value(value: str):
    translation_table = str.maketrans({
        "ç": "c",
        "ğ": "g",
        "ı": "i",
        "ö": "o",
        "ş": "s",
        "ü": "u",
        "Ç": "c",
        "Ğ": "g",
        "İ": "i",
        "I": "i",
        "Ö": "o",
        "Ş": "s",
        "Ü": "u"
    })

    normalized = (value or "").lower().translate(translation_table)

    for separator in ["-", "_", "/", "\\", "."]:
        normalized = normalized.replace(separator, " ")

    return " ".join(normalized.split())


def sanitize_kb_question(question: str):
    clean_question = " ".join((question or "").strip().split())

    for pattern in SENSITIVE_PATTERNS:
        if pattern in clean_question.lower():
            clean_question = clean_question.replace(pattern, "[MASKED]")

    return clean_question[:500]


def tokenize_search_text(value: str):
    return [
        token.strip(".,;:!?()[]{}\"'").lower()
        for token in normalize_search_value(value).split()
        if (
            len(token.strip(".,;:!?()[]{}\"'")) >= 3 and
            token.strip(".,;:!?()[]{}\"'").lower() not in KB_STOPWORDS
        )
    ]


def score_article_for_query(article: models.KnowledgeArticle, query: str):
    tokens = tokenize_search_text(query)
    haystack = normalize_search_value(" ".join([
        article.title or "",
        article.category or "",
        article.keywords or "",
        article.content or "",
        article.solution_steps or ""
    ]))
    keyword_text = normalize_search_value(article.keywords or "")
    title_text = normalize_search_value(article.title or "")
    score = 0

    for token in tokens:
        if token in haystack:
            score += 1

        if token in keyword_text:
            score += 2

        if token in title_text:
            score += 2

        if any(
            haystack_token.startswith(token[:5]) or token.startswith(haystack_token[:5])
            for haystack_token in haystack.split()
            if len(haystack_token) >= 5 and len(token) >= 5
        ):
            score += 1

    return score


def search_kb_articles(db: Session, query: str, limit: int = 5):
    sanitized_query = sanitize_kb_question(query)
    articles = db.query(models.KnowledgeArticle).filter(
        models.KnowledgeArticle.is_active == 1
    ).all()
    scored_articles = [
        (score_article_for_query(article, sanitized_query), article)
        for article in articles
    ]

    return [
        article for score, article in sorted(
            scored_articles,
            key=lambda item: item[0],
            reverse=True
        )
        if score >= 2
    ][:limit]


def build_kb_answer(question: str, articles: list):
    if not articles:
        return {
            "answer": (
                "Knowledge Base içinde bu sorunla eşleşen bir makale bulunamadı. "
                "Bu nedenle KB dışı tahmin yapmıyorum. Çözülmedi seçeneğiyle ticket oluşturabilirsiniz."
            ),
            "resolved": False,
            "confidence": 0
        }

    primary_article = articles[0]
    steps = [
        step.strip(" -")
        for step in (primary_article.solution_steps or "").replace("\r", "\n").split("\n")
        if step.strip(" -")
    ]
    answer_lines = [
        f"KB makalesine göre öneri: {primary_article.title}",
        primary_article.content
    ]

    if steps:
        answer_lines.append("Kontrol adımları:")
        answer_lines.extend([f"{index + 1}. {step}" for index, step in enumerate(steps[:6])])

    if len(articles) > 1:
        answer_lines.append(
            "İlgili diğer KB makaleleri: " +
            ", ".join(article.title for article in articles[1:3])
        )

    return {
        "answer": "\n".join(answer_lines),
        "resolved": True,
        "confidence": min(95, 55 + (len(articles) * 10)),
    }


def seed_knowledge_articles(db: Session):
    seed_articles = [
        {
            "title": "Outlook uygulaması ve profil sorunu",
            "category": "MS",
            "keywords": "outlook e-posta eposta mail profil açılmıyor acilmiyor office",
            "content": "Outlook sorunlarında web erişimi, profil durumu, lisans ve servis sağlığı ayrıştırılır.",
            "solution_steps": "Web Outlook üzerinden giriş deneyin.\nOutlook uygulamasını kapatıp yeniden açın.\nHata mesajını ve etkilenen klasörü not edin.\nSorun yalnızca masaüstü uygulamasındaysa profil/cache kontrolü için ticket açın."
        },
        {
            "title": "E-posta gönderme ve alma problemi",
            "category": "MS",
            "keywords": "e-posta eposta email mail gönderme gonderme alma bounce gecikme teslim edilemedi",
            "content": "E-posta akışında adres doğruluğu, kota, kural ve geri dönüş mesajı kontrol edilir.",
            "solution_steps": "Alıcı adresini ve domain bilgisini doğrulayın.\nWeb Outlook üzerinden test mail gönderin.\nGeri dönüş/bounce mesajını ticket açıklamasına ekleyin.\nKota, kural veya transport kontrolü için MS ekibine yönlendirin."
        },
        {
            "title": "Teams toplantı ses kamera ve chat sorunu",
            "category": "MS",
            "keywords": "teams toplantı toplanti meeting ses mikrofon kamera chat mesaj",
            "content": "Teams sorunlarında web istemci, cihaz izinleri, cache ve lisans durumu kontrol edilir.",
            "solution_steps": "Teams web sürümünü deneyin.\nMikrofon ve kamera izinlerini kontrol edin.\nFarklı toplantı veya cihazla test edin.\nSorun devam ederse hata ekranı ile ticket açın."
        },
        {
            "title": "Şifre parola ve hesap kilidi",
            "category": "MS",
            "keywords": "şifre sifre parola password hesap kilit kilitlendi login giriş giris",
            "content": "Hesap kilidi ve parola problemlerinde kullanıcı adı, parola süresi ve hatalı deneme sayısı değerlendirilir.",
            "solution_steps": "Kullanıcı adını ve Caps Lock durumunu kontrol edin.\nSon parolanızı doğru girdiğinizden emin olun.\nHesap kilitliyse tekrar denemeyi durdurun.\nYetkili parola sıfırlama süreci için ticket açın."
        },
        {
            "title": "MFA Authenticator ve OTP sorunu",
            "category": "MS",
            "keywords": "mfa otp authenticator doğrulama dogrulama sms bildirim telefon kod",
            "content": "MFA sorunlarında kayıtlı yöntem, telefon saati, bildirim ve alternatif doğrulama seçenekleri incelenir.",
            "solution_steps": "Telefon saatini otomatik moda alın.\nAuthenticator bildirimi veya OTP kodu gelip gelmediğini kontrol edin.\nAlternatif doğrulama yöntemi varsa deneyin.\nCihaz değiştiyse MFA reset için ticket açın."
        },
        {
            "title": "Oturum açma ve hesap erişimi",
            "category": "MS",
            "keywords": "oturum login log in giriş giris hesap account erişim erisim yetki açılmıyor acilmiyor",
            "content": "Oturum problemlerinde hesap aktifliği, lisans, yetki ve tarayıcı oturumu ayrıştırılır.",
            "solution_steps": "Hata mesajını not edin.\nGizli pencere veya farklı tarayıcı ile deneyin.\nKurumsal hesabınızın aktif olduğunu doğrulatın.\nYetki eksikliği varsa request süreci başlatın."
        },
        {
            "title": "OneDrive senkronizasyon ve kota",
            "category": "MS",
            "keywords": "onedrive one drive senkronizasyon sync eşitleme esitleme kota dosya",
            "content": "OneDrive sorunlarında sync client, web erişimi, kota ve dosya yolu uzunluğu kontrol edilir.",
            "solution_steps": "Web OneDrive erişimini deneyin.\nOneDrive ikonundaki hata durumunu kontrol edin.\nSenkronize olmayan klasör/dosya adını yazın.\nKota veya lisans kontrolü için ticket açın."
        },
        {
            "title": "SharePoint dosya ve site erişimi",
            "category": "MS",
            "keywords": "sharepoint site dosya doküman dokuman belge izin erişim erisim link",
            "content": "SharePoint erişiminde link doğruluğu, site izni, dosya kilidi ve tarayıcı durumu incelenir.",
            "solution_steps": "Linkin doğru olduğundan emin olun.\nFarklı tarayıcı ile deneyin.\nDosya veya site adını açıklamaya ekleyin.\nYetki eksikse site sahibi veya MS ekibi kontrol eder."
        },
        {
            "title": "Office Word Excel PowerPoint sorunu",
            "category": "MS",
            "keywords": "office word excel powerpoint ppt aktivasyon lisans açılmıyor acilmiyor makro",
            "content": "Office uygulama sorunlarında lisans, aktivasyon, dosya bütünlüğü ve uygulama onarımı değerlendirilir.",
            "solution_steps": "Office uygulamasını yeniden başlatın.\nDosyayı web sürümünde açmayı deneyin.\nAktivasyon veya hata mesajını not edin.\nOffice repair/güncelleme için ticket açın."
        },
        {
            "title": "Mailbox kota ve arşiv sorunu",
            "category": "MS",
            "keywords": "mailbox posta kutusu kota arşiv arsiv dolu mail gönderemiyorum gonderemiyorum",
            "content": "Mailbox kota sorunlarında posta kutusu boyutu, silinmiş öğeler, büyük ekler ve arşiv politikası incelenir.",
            "solution_steps": "Silinmiş öğeler ve gereksiz büyük ekleri temizleyin.\nWeb Outlook kota bilgisini kontrol edin.\nOnline archive görünmüyorsa belirtin.\nKota artışı gerekiyorsa request açın."
        },
        {
            "title": "Dağıtım grubu ve ortak mailbox",
            "category": "MS",
            "keywords": "dağıtım dagitim distribution grup ortak mailbox shared mailbox üyelik uyelik gönderme yetkisi",
            "content": "Dağıtım grubu ve ortak mailbox sorunlarında üyelik, gönderme yetkisi ve adres defteri durumu kontrol edilir.",
            "solution_steps": "Grup veya mailbox adını yazın.\nSorunun gönderme mi alma mı olduğunu belirtin.\nOutlook adres defterini güncelleyin.\nÜyelik veya yetki için request açın."
        },
        {
            "title": "Takvim toplantı daveti ve oda rezervasyonu",
            "category": "MS",
            "keywords": "takvim calendar toplantı toplanti davet oda rezervasyon uygunluk availability",
            "content": "Takvim sorunlarında davet teslimi, paylaşımlı takvim izni ve oda kaynağı kontrol edilir.",
            "solution_steps": "Web Outlook takvimini deneyin.\nToplantı davetindeki hata mesajını ekleyin.\nPaylaşımlı takvim/oda adını yazın.\nYetki veya kaynak ayarı için ticket açın."
        },
        {
            "title": "VPN bağlantı ve uzak erişim",
            "category": "Network",
            "keywords": "vpn uzak erişim erisim bağlantı baglanti mfa iç sistem ic sistem bağlanamıyorum baglanamiyorum",
            "content": "VPN sorunlarında internet bağlantısı, kimlik doğrulama ve bağlantı sonrası iç kaynak erişimi ayrıştırılır.",
            "solution_steps": "İnternet bağlantınızı kontrol edin.\nVPN uygulamasını yeniden başlatın.\nMFA onayının tamamlandığını doğrulayın.\nVPN bağlanıyor ama iç sistem açılmıyorsa Network ekibine ticket açın."
        },
        {
            "title": "İnternet erişimi yok",
            "category": "Network",
            "keywords": "internet erişim erisim web site proxy dış ağ dis ag çıkış cikis",
            "content": "İnternet erişim sorunlarında lokasyon, kablolu/kablosuz bağlantı, proxy ve DNS durumu kontrol edilir.",
            "solution_steps": "Birden fazla site deneyin.\nKablolu ve Wi-Fi bağlantıyı ayrı test edin.\nAynı lokasyonda genel sorun var mı kontrol edin.\nHata ekranını açıklamaya ekleyin."
        },
        {
            "title": "Wi-Fi kablosuz bağlantı sorunu",
            "category": "Network",
            "keywords": "wifi wi-fi kablosuz wireless ssid sinyal kopuyor bağlanamıyorum baglanamiyorum",
            "content": "Wi-Fi sorunlarında SSID, sinyal gücü, cihaz sertifikası ve lokasyon etkisi incelenir.",
            "solution_steps": "Doğru Wi-Fi ağına bağlandığınızı kontrol edin.\nWi-Fi kapat/aç yapın.\nBaşka lokasyonda deneyin.\nSorun lokasyon bazlıysa Network ekibine ticket açın."
        },
        {
            "title": "Kablolu ağ ethernet ve port sorunu",
            "category": "Network",
            "keywords": "lan ethernet kablo port switch dhcp ip kablolu ağ ag",
            "content": "Kablolu ağ sorunlarında fiziksel kablo, switch portu, IP alma ve port aktivasyonu kontrol edilir.",
            "solution_steps": "Ethernet kablosunu çıkarıp takın.\nFarklı kablo veya port deneyin.\nCihaz IP alıyor mu kontrol ettirin.\nPort kapalıysa network port request açın."
        },
        {
            "title": "DNS ve isim çözümleme sorunu",
            "category": "Network",
            "keywords": "dns isim çözümleme cozumleme url domain ip erişemiyorum erisemiyorum",
            "content": "DNS sorunlarında URL, IP ile erişim farkı, DNS cache ve kayıt durumu incelenir.",
            "solution_steps": "Erişilemeyen URL bilgisini yazın.\nIP ile erişim olup olmadığını belirtin.\nFarklı kullanıcıda aynı sorun var mı kontrol edin.\nDNS cache temizliği veya kayıt kontrolü için ticket açın."
        },
        {
            "title": "Ortak klasör network drive erişimi",
            "category": "Network",
            "keywords": "ortak klasör ortak klasor paylaşım paylasim network drive mapped drive dosya erişim erisim",
            "content": "Ortak klasör sorunlarında paylaşım yolu, yetki, VPN/kampüs ağı ve map durumu kontrol edilir.",
            "solution_steps": "Paylaşım yolunu açıklamaya ekleyin.\nKurum ağına veya VPN e bağlı olduğunuzu doğrulayın.\nYetki hatası mı bağlantı hatası mı belirtin.\nDrive yeniden map edilebilir."
        },
        {
            "title": "İç uygulama ve core banking erişimi",
            "category": "Network",
            "keywords": "iç uygulama ic uygulama core banking firewall erişim erisim uygulama port url",
            "content": "İç uygulama erişiminde ağ rotası, firewall, kullanıcı yetkisi ve uygulama erişilebilirliği ayrıştırılır.",
            "solution_steps": "Uygulama adını ve URL/IP bilgisini yazın.\nVPN veya kurum ağı durumunu belirtin.\nHata mesajı ve saat bilgisini ekleyin.\nFirewall veya yetki gerekiyorsa ilgili request açın."
        },
        {
            "title": "Ağ yavaşlığı ve kopma",
            "category": "Network",
            "keywords": "ağ ag yavaş yavas kopma kopuyor kesiliyor paket kaybı ping latency",
            "content": "Ağ performans sorunlarında lokasyon, saat aralığı, bağlantı tipi ve paket kaybı incelenir.",
            "solution_steps": "Sorunun başladığı saati not edin.\nKablolu ve Wi-Fi ayrı test edin.\nAynı lokasyondaki diğer kullanıcıları kontrol edin.\nPing veya hız testi sonucu varsa ekleyin."
        },
        {
            "title": "Network yazıcı erişimi",
            "category": "Network",
            "keywords": "network yazıcı yazici printer ip kuyruk queue erişim erisim",
            "content": "Network yazıcı sorunlarında yazıcı IP si, online durumu, print queue ve ağ erişimi kontrol edilir.",
            "solution_steps": "Yazıcı adını veya IP bilgisini yazın.\nYazıcı online mı kontrol edin.\nBaşka kullanıcı yazdırabiliyor mu deneyin.\nKuyruk veya IP bağlantısı için ticket açın."
        },
        {
            "title": "Telefon ve VoIP sorunu",
            "category": "Network",
            "keywords": "telefon voip softphone santral dahili ses kesiliyor arama",
            "content": "Telefon/VoIP sorunlarında dahili numara, cihaz bağlantısı, network ve santral durumu kontrol edilir.",
            "solution_steps": "Dahili numaranızı yazın.\nSorun gelen mi giden aramada mı belirtin.\nTelefonu yeniden başlatın.\nAynı bölgede genel sorun varsa Network ekibine bildirin."
        },
        {
            "title": "Laptop açılmıyor performans ve batarya",
            "category": "Technical",
            "keywords": "laptop notebook açılmıyor acilmiyor yavaş yavas batarya pil şarj sarj ısınma isinma",
            "content": "Laptop sorunlarında güç, batarya, ısınma, donanım ve işletim sistemi durumu kontrol edilir.",
            "solution_steps": "Adaptör ve şarj ışığını kontrol edin.\nHarici cihazları çıkarıp deneyin.\nHata ışığı/sesi varsa not edin.\nFiziksel arıza veya yedek cihaz için ticket açın."
        },
        {
            "title": "Masaüstü bilgisayar sorunu",
            "category": "Technical",
            "keywords": "masaüstü masaustu desktop pc bilgisayar açılmıyor acilmiyor donuyor performans",
            "content": "Masaüstü PC sorunlarında güç, monitör bağlantısı, donanım ve işletim sistemi kontrolleri yapılır.",
            "solution_steps": "Güç kablosu ve prizi kontrol edin.\nMonitörün açık olduğundan emin olun.\nHata sesi veya ışığı varsa not edin.\nSon değişiklikleri ticket açıklamasına ekleyin."
        },
        {
            "title": "Monitör ve ekran görüntü sorunu",
            "category": "Technical",
            "keywords": "monitör monitor ekran görüntü goruntu hdmi display çözünürlük cozunurluk",
            "content": "Monitör sorunlarında güç, görüntü kablosu, giriş kaynağı ve ekran yansıtma ayarı kontrol edilir.",
            "solution_steps": "Güç ve görüntü kablosunu kontrol edin.\nDoğru input kaynağını seçin.\nLaptop ekran yansıtma ayarını kontrol edin.\nFarklı kablo veya monitör ile deneyin."
        },
        {
            "title": "Klavye mouse ve touchpad sorunu",
            "category": "Technical",
            "keywords": "klavye keyboard mouse fare touchpad usb alıcı alici pil",
            "content": "Klavye ve mouse sorunlarında bağlantı, pil, USB port ve cihaz arızası kontrol edilir.",
            "solution_steps": "USB alıcıyı veya kabloyu çıkarıp takın.\nKablosuz cihazlarda pili kontrol edin.\nFarklı USB port deneyin.\nArıza devam ederse değişim talebi açın."
        },
        {
            "title": "Yazıcı çıktı toner ve kağıt sorunu",
            "category": "Technical",
            "keywords": "yazıcı yazici printer toner kağıt kagit çıktı cikti driver sürücü surucu",
            "content": "Yazıcı sorunlarında toner, kağıt, hata kodu, sürücü ve kuyruk durumu kontrol edilir.",
            "solution_steps": "Kağıt ve toner durumunu kontrol edin.\nYazıcı ekranındaki hata kodunu yazın.\nKuyrukta bekleyen işleri kontrol edin.\nSürücü kurulumu gerekirse ticket açın."
        },
        {
            "title": "Tarayıcı scanner sorunu",
            "category": "Technical",
            "keywords": "tarayıcı tarayici scanner scan belge görüntü goruntu sürücü surucu",
            "content": "Tarayıcı sorunlarında cihaz bağlantısı, sürücü, profil ve belge kalitesi kontrol edilir.",
            "solution_steps": "Cihazın açık ve bağlı olduğunu kontrol edin.\nTarama uygulamasındaki hata mesajını yazın.\nFarklı belge ile deneyin.\nSürücü veya profil ayarı için ticket açın."
        },
        {
            "title": "Kamera kulaklık adaptör ve docking",
            "category": "Technical",
            "keywords": "kamera webcam kulaklık kulaklik headset adaptör adapter dock docking usb type-c",
            "content": "Çevre birimi sorunlarında bağlantı portu, cihaz seçimi, sürücü ve fiziksel hasar kontrol edilir.",
            "solution_steps": "Cihazı çıkarıp yeniden takın.\nFarklı USB/Type-C port deneyin.\nTeams/Zoom içinde doğru cihazı seçin.\nFiziksel hasar varsa açıklamaya ekleyin."
        },
        {
            "title": "Mobil cihaz ve kurum telefonu",
            "category": "Technical",
            "keywords": "mobil cihaz telefon tablet mdm profil kurumsal uygulama sim",
            "content": "Mobil cihaz sorunlarında cihaz bağlantısı, kurumsal profil, uygulama ve fiziksel durum kontrol edilir.",
            "solution_steps": "Cihazı yeniden başlatın.\nWi-Fi veya mobil veri durumunu kontrol edin.\nKurumsal profil uyarısını açıklamaya ekleyin.\nFiziksel hasar varsa belirtin."
        },
        {
            "title": "POS ATM kart okuyucu ve token cihazları",
            "category": "Technical",
            "keywords": "pos atm kart okuyucu card reader token cihaz şube sube hata kodu",
            "content": "Şube operasyon cihazlarında model, lokasyon, hata kodu ve bağlantı/güç durumu öncelikli incelenir.",
            "solution_steps": "Cihaz modelini ve lokasyonu yazın.\nHata kodunu açıklamaya ekleyin.\nGüç ve bağlantı kablolarını kontrol edin.\nİşlem etkisi yüksekse aciliyet belirtin."
        },
        {
            "title": "Yazılım kurulum kaldırma ve güncelleme",
            "category": "Technical",
            "keywords": "yazılım yazilim software kurulum install yükleme yukleme kaldırma kaldirma update güncelleme",
            "content": "Yazılım kurulum sorunlarında paket, sürüm, admin yetkisi ve lisans gereksinimi kontrol edilir.",
            "solution_steps": "Yazılım adını ve sürümünü yazın.\nKurulum hata mesajını ekleyin.\nAdmin yetkisi veya lisans gerekip gerekmediği kontrol edilir.\nStandart dışı yazılımlar onay sürecine alınır."
        },
        {
            "title": "Monitör talebi",
            "category": "Technical",
            "keywords": "monitör talebi monitor ekran ikinci ekran donanım talep",
            "content": "Monitör taleplerinde ihtiyaç gerekçesi, adet, lokasyon ve stok durumu değerlendirilir.",
            "solution_steps": "Talep edilen adet ve lokasyonu yazın.\nİkinci ekran ihtiyacının iş gerekçesini belirtin.\nMevcut cihaz varsa envanter bilgisini ekleyin.\nOnay sonrası Technical ekibi planlama yapar."
        },
        {
            "title": "Mouse klavye ve çevre birimi talebi",
            "category": "Technical",
            "keywords": "mouse klavye keyboard fare kulaklık kamera adaptör talep",
            "content": "Çevre birimi taleplerinde cihaz tipi, arıza/değişim gerekçesi ve lokasyon bilgisi gerekir.",
            "solution_steps": "Talep edilen cihaz tipini yazın.\nArızalı ürün varsa belirtin.\nLokasyon ve kullanıcı bilgisini ekleyin.\nStok durumuna göre teslim planlanır."
        },
        {
            "title": "Laptop docking mobil cihaz talebi",
            "category": "Technical",
            "keywords": "laptop docking station mobil cihaz telefon tablet talep",
            "content": "Cihaz taleplerinde rol, kullanım amacı, onay ve envanter uygunluğu değerlendirilir.",
            "solution_steps": "Kullanım amacını ve lokasyonu yazın.\nMevcut cihaz/envanter bilgisini ekleyin.\nYönetici onayı gerekiyorsa talebe ekleyin.\nOnay sonrası Technical ekibi teslim planlar."
        },
        {
            "title": "Yazıcı tarayıcı talebi",
            "category": "Technical",
            "keywords": "yazıcı yazici tarayıcı tarayici scanner talep şube sube",
            "content": "Yazıcı/tarayıcı taleplerinde lokasyon, kullanım hacmi ve ağ bağlantı gereksinimi değerlendirilir.",
            "solution_steps": "Cihazın kurulacağı lokasyonu yazın.\nBeklenen kullanım hacmini belirtin.\nNetwork bağlantısı gerekiyorsa ekleyin.\nOnay sonrası kurulum planlanır."
        },
        {
            "title": "Yazılım ve lisans talebi",
            "category": "MS",
            "keywords": "yazılım yazilim lisans license office visio project power bi talep",
            "content": "Yazılım ve lisans taleplerinde ürün adı, kullanıcı, kullanım gerekçesi ve lisans uygunluğu kontrol edilir.",
            "solution_steps": "Yazılım adını ve sürümünü yazın.\nKullanım gerekçesini belirtin.\nLisans gerekiyorsa ürün tipini ekleyin.\nOnay sonrası MS/Technical ekipleri işlem yapar."
        },
        {
            "title": "Yetki ve uygulama erişim talebi",
            "category": "MS",
            "keywords": "yetki erişim erisim rol uygulama hesap user permission talep",
            "content": "Yetki taleplerinde uygulama, rol, veri kapsamı, yönetici onayı ve ayrım prensibi kontrol edilir.",
            "solution_steps": "Uygulama adını ve istenen rolü yazın.\nİş gerekçesini belirtin.\nYönetici/onay bilgisini ekleyin.\nOnay sonrası ilgili ekip yetkiyi tanımlar."
        },
        {
            "title": "Ortak mailbox ve dağıtım grubu talebi",
            "category": "MS",
            "keywords": "ortak mailbox shared mailbox dağıtım dagitim grup distribution üyelik uyelik talep",
            "content": "Ortak mailbox ve dağıtım grubu taleplerinde ad, sahip, üyeler ve gönderme yetkileri belirlenir.",
            "solution_steps": "Mailbox/grup adını yazın.\nSahip ve üye listesini ekleyin.\nGönderme yetkisi gerekiyorsa belirtin.\nMS ekibi onay sonrası oluşturur veya günceller."
        },
        {
            "title": "Dosya paylaşım alanı talebi",
            "category": "MS",
            "keywords": "dosya paylaşım paylasim sharepoint klasör klasor alan yetki talep",
            "content": "Dosya paylaşım taleplerinde alan adı, sahiplik, üye listesi ve erişim seviyesi belirlenir.",
            "solution_steps": "Paylaşım alanı adını yazın.\nSahip ve üye listesini ekleyin.\nOkuma/yazma yetkilerini belirtin.\nMS ekibi uygun platformda alanı oluşturur."
        },
        {
            "title": "VPN yetkisi talebi",
            "category": "Network",
            "keywords": "vpn yetki uzak erişim erisim remote talep",
            "content": "VPN yetki taleplerinde kullanıcı, iş gerekçesi, süre ve onay bilgisi değerlendirilir.",
            "solution_steps": "VPN ihtiyacının gerekçesini yazın.\nSüreli mi kalıcı mı belirtin.\nYönetici onayını ekleyin.\nNetwork ekibi onay sonrası erişimi tanımlar."
        },
        {
            "title": "Statik IP port ve firewall talebi",
            "category": "Network",
            "keywords": "statik ip port aktivasyon firewall kural erişim erisim talep",
            "content": "Network erişim taleplerinde kaynak, hedef, port, protokol ve iş gerekçesi açık yazılmalıdır.",
            "solution_steps": "Kaynak ve hedef IP/URL bilgisini yazın.\nPort ve protokol bilgisini ekleyin.\nİş gerekçesini belirtin.\nOnay sonrası Network ekibi kuralı uygular."
        },
        {
            "title": "İç uygulama erişim talebi",
            "category": "Network",
            "keywords": "uygulama erişim erisim core banking iç sistem ic sistem firewall talep",
            "content": "İç uygulama erişim taleplerinde uygulama adı, kullanıcı, kaynak ağ ve gerekli rol/erişim kapsamı kontrol edilir.",
            "solution_steps": "Uygulama adını ve erişilecek ortamı yazın.\nKullanıcı veya grup bilgisini ekleyin.\nKaynak lokasyon/VPN durumunu belirtin.\nNetwork ve uygulama sahibi onayı sonrası işlem yapılır."
        },
    ]

    created_count = 0

    for article in seed_articles:
        existing_article = db.query(models.KnowledgeArticle).filter(
            models.KnowledgeArticle.title == article["title"]
        ).first()

        if existing_article:
            continue

        db.add(models.KnowledgeArticle(**article))
        created_count += 1

    if created_count:
        db.commit()

def get_or_create_user(
    db: Session,
    username: str,
    full_name: str,
    role: str,
    department: str,
    password: str = "Passw0rd!"
):
    user = db.query(models.User).filter(models.User.username == username).first()

    if user:
        return user, False

    user = models.User(
        full_name=full_name,
        username=username,
        password=hash_password(password),
        role=role,
        department=department
    )
    db.add(user)
    db.flush()

    return user, True


def migrate_plaintext_passwords(db: Session):
    users = db.query(models.User).all()
    migrated_count = 0

    for user in users:
        if not is_password_hash(user.password):
            user.password = hash_password(user.password)
            migrated_count += 1

    if migrated_count:
        create_audit_log(
            db,
            "system",
            "System Auth Migration",
            "system",
            "password_hash_migration",
            f"{migrated_count} kullanıcı şifresi bcrypt hash formatına taşındı."
        )
        db.commit()


def seed_demo_users_and_activity(db: Session):
    seed_done = db.query(models.AuditLog).filter(
        models.AuditLog.action == "seed_audit_v1_completed"
    ).first()

    departments = [
        "Şube Operasyon",
        "Risk Yönetimi",
        "Kredi Operasyon",
        "Dijital Bankacılık",
        "Finans",
        "Kart Operasyon",
        "Uyum",
        "İnsan Kaynakları",
        "Hazine",
        "Müşteri Deneyimi"
    ]
    created_count = 0

    for index in range(1, 11):
        _, created = get_or_create_user(
            db,
            f"admin{index:02d}",
            f"Admin Kullanıcı {index:02d}",
            "admin",
            "IT Yönetim"
        )
        created_count += int(created)

    staff_specs = [
        ("ms", "MS", "Microsoft Services"),
        ("technical", "Technical", "Technical Support"),
        ("network", "Network", "Network Operations")
    ]

    for role, department, full_department in staff_specs:
        for index in range(1, 11):
            _, created = get_or_create_user(
                db,
                f"{role}{index:02d}",
                f"{department} Staff {index:02d}",
                role,
                full_department
            )
            created_count += int(created)

    for index in range(1, 51):
        _, created = get_or_create_user(
            db,
            f"user{index:02d}",
            f"Banka Kullanıcı {index:02d}",
            "user",
            departments[(index - 1) % len(departments)]
        )
        created_count += int(created)

    if created_count:
        create_audit_log(
            db,
            "system",
            "System Seed",
            "system",
            "seed_users",
            f"Demo organizasyon kullanıcıları oluşturuldu: {created_count} yeni kullanıcı."
        )

    if seed_done:
        db.commit()
        return

    issue_cycle = [
        ("outlook", "Outlook mail gönderme sorunu yaşıyorum."),
        ("vpn", "VPN bağlanıyor fakat iç sistemlere erişemiyorum."),
        ("password", "Hesabım kilitlendi ve giriş yapamıyorum."),
        ("teams", "Teams toplantısında ses problemi yaşıyorum."),
        ("onedrive", "OneDrive senkronizasyon hatası alıyorum.")
    ]
    request_cycle = [
        ("Monitör Talebi", "Yeni monitör ihtiyacım var."),
        ("Yazılım Talebi", "Analiz yazılımı kurulumu gerekiyor."),
        ("VPN Yetkisi", "Uzaktan çalışma için VPN yetkisi gerekiyor."),
        ("Mouse Talebi", "Mouse arızalı, değişim gerekiyor.")
    ]
    admins = db.query(models.User).filter(models.User.role == "admin").order_by(models.User.username).all()
    users = db.query(models.User).filter(models.User.role == "user").order_by(models.User.username).all()
    staff_by_department = {
        "MS": db.query(models.User).filter(models.User.role == "ms").order_by(models.User.username).all(),
        "Technical": db.query(models.User).filter(models.User.role == "technical").order_by(models.User.username).all(),
        "Network": db.query(models.User).filter(models.User.role == "network").order_by(models.User.username).all()
    }

    for index, user in enumerate(users[:30], start=1):
        issue_type, description = issue_cycle[(index - 1) % len(issue_cycle)]
        ticket_no = generate_ticket_no(db)
        original_department = TICKET_ROUTING.get(issue_type, "MS")
        agent_decision = analyze_ticket_with_ai_agent(issue_type, description, original_department)
        assigned_department = agent_decision["suggested_department"]
        staff_pool = staff_by_department.get(assigned_department) or []
        assigned_staff = staff_pool[(index - 1) % len(staff_pool)] if staff_pool else None
        status = "Çözüldü" if index % 3 == 0 else ("İnceleniyor" if index % 2 == 0 else "Açık")

        ticket = models.Ticket(
            ticket_no=ticket_no,
            full_name=user.full_name,
            department=user.department,
            issue_type=issue_type,
            description=description,
            status=status,
            priority=TICKET_PRIORITY.get(issue_type, "Normal"),
            sla_hours=TICKET_SLA.get(issue_type, 24),
            assigned_department=assigned_department,
            assigned_to=assigned_staff.full_name if assigned_staff and status != "Açık" else None,
            created_by=user.username
        )
        db.add(ticket)
        db.flush()

        create_timeline_event(
            db,
            "ticket",
            ticket.id,
            "created",
            f"{ticket_no} demo kullanıcı adına oluşturuldu.",
            user.username
        )
        create_audit_log(
            db,
            user.username,
            user.full_name,
            user.role,
            "ticket_created",
            f"{user.full_name} adına demo ticket oluşturuldu ve {assigned_department} birimine yönlendirildi.",
            "ticket",
            ticket.id,
            ticket_no
        )

        if assigned_staff and status != "Açık":
            create_timeline_event(
                db,
                "ticket",
                ticket.id,
                "updated",
                f"{assigned_staff.full_name} ticket durumunu {status} yaptı.",
                assigned_staff.username
            )
            create_audit_log(
                db,
                assigned_staff.username,
                assigned_staff.full_name,
                assigned_staff.role,
                "ticket_status_updated",
                f"{assigned_staff.full_name} {ticket_no} durumunu {status} yaptı.",
                "ticket",
                ticket.id,
                ticket_no
            )

    for index, user in enumerate(users[30:50], start=1):
        request_type, description = request_cycle[(index - 1) % len(request_cycle)]
        request_no = generate_request_no(db)
        assigned_department = REQUEST_ROUTING.get(request_type)
        admin = admins[(index - 1) % len(admins)]
        approval_status = "Onaylandı" if index % 4 != 0 else "Reddedildi"

        request = models.ITRequest(
            request_no=request_no,
            full_name=user.full_name,
            department=user.department,
            request_type=request_type,
            description=description,
            approval_status=approval_status,
            assigned_department=assigned_department if approval_status == "Onaylandı" else None,
            assigned_to=None,
            created_by=user.username
        )
        db.add(request)
        db.flush()

        create_timeline_event(
            db,
            "request",
            request.id,
            "created",
            f"{request_no} demo kullanıcı adına oluşturuldu.",
            user.username
        )
        create_audit_log(
            db,
            user.username,
            user.full_name,
            user.role,
            "request_created",
            f"{user.full_name} adına demo request oluşturuldu.",
            "request",
            request.id,
            request_no
        )
        create_timeline_event(
            db,
            "request",
            request.id,
            "updated",
            f"{admin.full_name} request durumunu {approval_status} yaptı.",
            admin.username
        )
        create_audit_log(
            db,
            admin.username,
            admin.full_name,
            admin.role,
            "request_approval_updated",
            f"{admin.full_name} {request_no} request durumunu {approval_status} yaptı.",
            "request",
            request.id,
            request_no
        )

    create_audit_log(
        db,
        "system",
        "System Seed",
        "system",
        "seed_audit_v1_completed",
        "Demo kullanıcıları adına ticket, request, staff işlem ve admin onay kayıtları üretildi."
    )
    db.commit()


def analyze_ticket_with_ai_agent(issue_type: str, description: str, original_department: str):
    normalized_issue_type = (issue_type or "").strip().lower()
    keyword_hits = []

    for department, rule in AI_AGENT_RULES.items():
        description_hits = [
            keyword for keyword in rule["keywords"]
            if keyword_matches_text(keyword, description)
        ]

        if description_hits:
            keyword_hits.append({
                "department": department,
                "hits": description_hits,
                "score": len(description_hits),
                "reason": rule["reason"]
            })

    keyword_hits.sort(key=lambda item: item["score"], reverse=True)
    best_match = keyword_hits[0] if keyword_hits else None
    selected_known = normalized_issue_type in TICKET_ROUTING

    if not best_match:
        if selected_known:
            selected_department_rule = AI_AGENT_RULES.get(original_department)
            selected_issue_hits = []

            if selected_department_rule:
                selected_issue_hits = [
                    keyword for keyword in selected_department_rule["keywords"]
                    if keyword_matches_text(keyword, normalized_issue_type)
                ]

            return {
                "should_report": False,
                "suggested_department": original_department,
                "action": "no_intervention",
                "reason": (
                    "Açıklamada seçilen kategoriyle çelişen teknik sinyal bulunmadı."
                    if not selected_issue_hits
                    else "Açıklamada farklı bir birime ait teknik sinyal bulunmadı; seçilen kategori korundu."
                ),
                "confidence": 55
            }

        return {
            "should_report": True,
            "suggested_department": "Technical",
            "action": "triage_unknown",
            "reason": "Kategori bilinmiyor ve açıklamada net sinyal yok; ilk müdahale için Technical triage kuyruğuna aktarıldı.",
            "confidence": 45
        }

    suggested_department = best_match["department"]
    confidence = min(95, 55 + (best_match["score"] * 12))

    if suggested_department != original_department:
        return {
            "should_report": True,
            "suggested_department": suggested_department,
            "action": "rerouted",
            "reason": (
                f"Talep açıklaması seçilen çağrı tipiyle çelişiyor. "
                f"{best_match['reason']} Eşleşen açıklama sinyalleri: {', '.join(best_match['hits'][:5])}."
            ),
            "confidence": confidence
        }

    if not selected_known:
        return {
            "should_report": True,
            "suggested_department": suggested_department,
            "action": "classified_unknown",
            "reason": f"Bilinmeyen kategori yerel AI agent tarafından sınıflandırıldı. {best_match['reason']}",
            "confidence": confidence
        }

    return {
        "should_report": False,
        "suggested_department": original_department,
        "action": "validated",
        "reason": "Talep açıklaması seçilen çağrı tipiyle uyumlu.",
        "confidence": confidence
    }


def create_ai_agent_report(
    db: Session,
    item_type: str,
    item_id: int,
    item_no: str,
    selected_issue_type: str,
    original_department: str,
    agent_decision: dict
):
    report = models.AIAgentReport(
        item_type=item_type,
        item_id=item_id,
        item_no=item_no,
        selected_issue_type=selected_issue_type,
        original_department=original_department,
        suggested_department=agent_decision["suggested_department"],
        action=agent_decision["action"],
        reason=agent_decision["reason"],
        confidence=agent_decision["confidence"],
        data_scope=AI_AGENT_DATA_SCOPE
    )

    db.add(report)
    return report


def generate_ticket_no(db: Session):
    last_ticket = db.query(models.Ticket).order_by(models.Ticket.id.desc()).first()

    if not last_ticket:
        return "INC-1001"

    last_number = int(last_ticket.ticket_no.split("-")[1])
    return f"INC-{last_number + 1}"


def generate_request_no(db: Session):
    last_request = db.query(models.ITRequest).order_by(models.ITRequest.id.desc()).first()

    if not last_request:
        return "REQ-1001"

    last_number = int(last_request.request_no.split("-")[1])
    return f"REQ-{last_number + 1}"


def get_message_parent(item_type: str, item_id: int, db: Session):
    if item_type == "ticket":
        return db.query(models.Ticket).filter(models.Ticket.id == item_id).first()

    if item_type == "request":
        return db.query(models.ITRequest).filter(models.ITRequest.id == item_id).first()

    raise HTTPException(status_code=400, detail="Geçersiz mesaj tipi")


def get_item_parent(item_type: str, item_id: int, db: Session):
    return get_message_parent(item_type, item_id, db)


def create_timeline_event(
    db: Session,
    item_type: str,
    item_id: int,
    event_type: str,
    description: str,
    created_by: str = "system"
):
    event = models.TimelineEvent(
        item_type=item_type,
        item_id=item_id,
        event_type=event_type,
        description=description,
        created_by=created_by or "system"
    )

    db.add(event)
    return event


def create_audit_log(
    db: Session,
    actor_username: str,
    actor_name: str,
    actor_role: str,
    action: str,
    details: str,
    item_type: str = None,
    item_id: int = None,
    item_no: str = None
):
    audit_log = models.AuditLog(
        actor_username=actor_username,
        actor_name=actor_name,
        actor_role=actor_role,
        action=action,
        item_type=item_type,
        item_id=item_id,
        item_no=item_no,
        details=details
    )

    db.add(audit_log)
    return audit_log


def describe_changes(before: dict, after_model, labels: dict):
    changes = []

    for field_name, label in labels.items():
        before_value = before.get(field_name)
        after_value = getattr(after_model, field_name)

        if before_value != after_value:
            changes.append(f"{label}: {before_value or '-'} -> {after_value or '-'}")

    return ", ".join(changes)


def normalize_agent_text(value: str):
    return normalize_search_value(value)


def keyword_matches_text(keyword: str, text: str):
    normalized_keyword = normalize_agent_text(keyword)
    normalized_text = normalize_agent_text(text)

    if not normalized_keyword or not normalized_text:
        return False

    if " " in normalized_keyword:
        return normalized_keyword in normalized_text

    text_tokens = normalized_text.split()

    if len(normalized_keyword) <= 3:
        return normalized_keyword in text_tokens

    return any(
        token == normalized_keyword or
        token.startswith(normalized_keyword) or
        normalized_keyword in token
        for token in text_tokens
    )


with SessionLocal() as seed_db:
    seed_knowledge_articles(seed_db)
    seed_demo_users_and_activity(seed_db)
    migrate_plaintext_passwords(seed_db)


# -------------------------
# USER AUTH
# -------------------------

@app.post("/register", response_model=schemas.UserResponse)
def register(user: schemas.UserCreate, db: Session = Depends(get_db)):
    existing_user = db.query(models.User).filter(
        models.User.username == user.username
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten var")

    new_user = models.User(
        full_name=user.full_name,
        username=user.username,
        password=hash_password(user.password),
        role=user.role,
        department=user.department
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@app.post("/login", response_model=schemas.LoginResponse)
def login(user: schemas.UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(models.User).filter(
        models.User.username == user.username
    ).first()

    if not db_user or not verify_password(user.password, db_user.password):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")

    if not is_password_hash(db_user.password):
        db_user.password = hash_password(user.password)
        db.commit()
        db.refresh(db_user)

    token = create_access_token({
        "sub": db_user.username,
        "role": db_user.role
    })

    return {
        "id": db_user.id,
        "full_name": db_user.full_name,
        "username": db_user.username,
        "role": db_user.role,
        "department": db_user.department,
        "access_token": token,
        "token_type": "bearer"
    }


@app.get("/users", response_model=list[schemas.UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    return db.query(models.User).order_by(
        models.User.role.asc(),
        models.User.full_name.asc()
    ).all()


@app.post("/users", response_model=schemas.UserResponse)
def create_user_admin(
    user: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    existing_user = db.query(models.User).filter(
        models.User.username == user.username
    ).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten var")

    new_user = models.User(
        full_name=user.full_name.strip(),
        username=user.username.strip(),
        password=hash_password(user.password),
        role=user.role.strip(),
        department=(user.department or "").strip() or None
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "user_created",
        f"Yeni kullanıcı oluşturuldu: {new_user.full_name} ({new_user.username}) / {new_user.role}.",
        "user",
        new_user.id,
        new_user.username
    )
    db.commit()

    return new_user


@app.put("/users/{user_id}", response_model=schemas.UserResponse)
def update_user_admin(
    user_id: int,
    user_update: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    before = {
        "full_name": user.full_name,
        "username": user.username,
        "role": user.role,
        "department": user.department
    }

    update_data = user_update.model_dump(exclude_unset=True)

    if "username" in update_data:
        new_username = update_data["username"].strip()
        existing_user = db.query(models.User).filter(
            models.User.username == new_username,
            models.User.id != user.id
        ).first()

        if existing_user:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten var")

        user.username = new_username

    if "full_name" in update_data and update_data["full_name"] is not None:
        user.full_name = update_data["full_name"].strip()

    if "role" in update_data and update_data["role"] is not None:
        user.role = update_data["role"].strip()

    if "department" in update_data:
        department_value = update_data["department"]
        user.department = department_value.strip() if isinstance(department_value, str) and department_value.strip() else None

    if "password" in update_data and update_data["password"]:
        user.password = hash_password(update_data["password"])

    db.commit()
    db.refresh(user)

    changes = describe_changes(
        before,
        user,
        {
            "full_name": "Ad Soyad",
            "username": "Kullanıcı Adı",
            "role": "Rol",
            "department": "Departman"
        }
    )

    if "password" in update_data and update_data["password"]:
        changes = f"{changes}, Şifre: güncellendi" if changes else "Şifre: güncellendi"

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "user_updated",
        f"Kullanıcı güncellendi: {user.full_name} ({user.username}). Değişiklikler: {changes or 'değişiklik yok'}.",
        "user",
        user.id,
        user.username
    )
    db.commit()

    return user


@app.delete("/users/{user_id}")
def delete_user_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    user = db.query(models.User).filter(models.User.id == user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if user.username == current_user.username:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")

    user_summary = f"{user.full_name} ({user.username}) / {user.role}"
    user_id_value = user.id
    user_username = user.username

    db.delete(user)
    db.commit()

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "user_deleted",
        f"Kullanıcı silindi: {user_summary}.",
        "user",
        user_id_value,
        user_username
    )
    db.commit()

    return {"message": "Kullanıcı silindi"}


# -------------------------
# INCIDENT / TICKET
# -------------------------

@app.post("/tickets", response_model=schemas.TicketResponse)
def create_ticket(ticket: schemas.TicketCreate, db: Session = Depends(get_db)):
    ticket_no = generate_ticket_no(db)

    assigned_department = TICKET_ROUTING.get(
        ticket.issue_type,
        "MS"
    )
    original_department = assigned_department
    agent_decision = analyze_ticket_with_ai_agent(
        ticket.issue_type,
        ticket.description,
        original_department
    )
    assigned_department = agent_decision["suggested_department"]

    new_ticket = models.Ticket(
        ticket_no=ticket_no,
        full_name=ticket.full_name,
        department=ticket.department,
        issue_type=ticket.issue_type,
        description=ticket.description,
        status="Açık",
        priority=TICKET_PRIORITY.get(ticket.issue_type, "Normal"),
        sla_hours=TICKET_SLA.get(ticket.issue_type, 24),
        assigned_department=assigned_department,
        assigned_to=None,
        created_by=ticket.created_by
    )

    db.add(new_ticket)
    db.flush()
    create_timeline_event(
        db,
        "ticket",
        new_ticket.id,
        "created",
        f"{ticket_no} oluşturuldu ve {assigned_department} ekibine yönlendirildi.",
        ticket.created_by
    )
    create_audit_log(
        db,
        ticket.created_by,
        ticket.full_name,
        "user",
        "ticket_created",
        f"{ticket.full_name} ticket oluşturdu. Atanan birim: {assigned_department}.",
        "ticket",
        new_ticket.id,
        ticket_no
    )

    if agent_decision["should_report"]:
        create_ai_agent_report(
            db,
            "ticket",
            new_ticket.id,
            ticket_no,
            ticket.issue_type,
            original_department,
            agent_decision
        )
        create_timeline_event(
            db,
            "ticket",
            new_ticket.id,
            "ai_agent",
            f"AI Agent yönlendirmeyi değerlendirdi: {original_department} -> {assigned_department}. {agent_decision['reason']}",
            "AI Agent"
        )

    db.commit()
    db.refresh(new_ticket)

    return new_ticket

@app.get("/tickets", response_model=list[schemas.TicketResponse])
def get_tickets(db: Session = Depends(get_db)):
    return db.query(models.Ticket).order_by(models.Ticket.created_at.desc()).all()


@app.get("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
def get_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket bulunamadı")

    return ticket


@app.put("/tickets/{ticket_id}", response_model=schemas.TicketResponse)
def update_ticket(
    ticket_id: int,
    ticket_update: schemas.TicketUpdate,
    db: Session = Depends(get_db)
):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket bulunamadı")

    before = {
        "status": ticket.status,
        "assigned_department": ticket.assigned_department,
        "assigned_to": ticket.assigned_to,
        "priority": ticket.priority
    }

    if ticket_update.status is not None:
        ticket.status = ticket_update.status

    if ticket_update.assigned_department is not None:
        ticket.assigned_department = ticket_update.assigned_department

    if ticket_update.assigned_to is not None:
        ticket.assigned_to = ticket_update.assigned_to

    if ticket_update.priority is not None:
        ticket.priority = ticket_update.priority

    ticket.updated_at = datetime.utcnow()
    change_description = describe_changes(before, ticket, {
        "status": "Durum",
        "assigned_department": "Atanan birim",
        "assigned_to": "Atanan kişi",
        "priority": "Öncelik"
    })

    if change_description:
        create_timeline_event(
            db,
            "ticket",
            ticket_id,
            "updated",
            change_description,
            ticket.assigned_to or ticket.created_by or "system"
        )
        create_audit_log(
            db,
            ticket.assigned_to or ticket.created_by or "system",
            ticket.assigned_to or ticket.created_by or "System",
            "staff",
            "ticket_updated",
            change_description,
            "ticket",
            ticket_id,
            ticket.ticket_no
        )

    db.commit()
    db.refresh(ticket)

    return ticket

@app.delete("/tickets/{ticket_id}")
def delete_ticket(ticket_id: int, db: Session = Depends(get_db)):
    ticket = db.query(models.Ticket).filter(models.Ticket.id == ticket_id).first()

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket bulunamadı")

    db.query(models.Message).filter(
        models.Message.item_type == "ticket",
        models.Message.item_id == ticket_id
    ).delete()
    db.query(models.TimelineEvent).filter(
        models.TimelineEvent.item_type == "ticket",
        models.TimelineEvent.item_id == ticket_id
    ).delete()
    create_audit_log(
        db,
        "system",
        "System",
        "system",
        "ticket_deleted",
        f"{ticket.ticket_no} silindi.",
        "ticket",
        ticket_id,
        ticket.ticket_no
    )
    db.delete(ticket)
    db.commit()

    return {"message": "Ticket silindi"}


@app.get("/tickets/{ticket_id}/messages", response_model=list[schemas.MessageResponse])
def get_ticket_messages(ticket_id: int, db: Session = Depends(get_db)):
    ticket = get_message_parent("ticket", ticket_id, db)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket bulunamadı")

    return db.query(models.Message).filter(
        models.Message.item_type == "ticket",
        models.Message.item_id == ticket_id
    ).order_by(models.Message.created_at.asc()).all()


@app.post("/tickets/{ticket_id}/messages", response_model=schemas.MessageResponse)
def create_ticket_message(
    ticket_id: int,
    message: schemas.MessageCreate,
    db: Session = Depends(get_db)
):
    ticket = get_message_parent("ticket", ticket_id, db)

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket bulunamadı")

    body = message.body.strip()

    if not body:
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz")

    new_message = models.Message(
        item_type="ticket",
        item_id=ticket_id,
        sender_name=message.sender_name.strip() or "Bilinmeyen",
        sender_role=message.sender_role,
        body=body
    )

    db.add(new_message)
    create_timeline_event(
        db,
        "ticket",
        ticket_id,
        "message",
        f"{new_message.sender_name} mesaj ekledi.",
        new_message.sender_name
    )
    ticket.updated_at = datetime.utcnow()
    create_audit_log(
        db,
        new_message.sender_name,
        new_message.sender_name,
        new_message.sender_role,
        "ticket_message_created",
        f"{ticket.ticket_no} için mesaj eklendi.",
        "ticket",
        ticket_id,
        ticket.ticket_no
    )
    db.commit()
    db.refresh(new_message)

    return new_message


# -------------------------
# REQUEST MANAGEMENT
# -------------------------

@app.post("/requests", response_model=schemas.RequestResponse)
def create_request(request: schemas.RequestCreate, db: Session = Depends(get_db)):
    request_no = generate_request_no(db)

    assigned_department = REQUEST_ROUTING.get(
        request.request_type,
        None
    )

    new_request = models.ITRequest(
        request_no=request_no,
        full_name=request.full_name,
        department=request.department,
        request_type=request.request_type,
        description=request.description,
        approval_status="Onay Bekliyor",
        assigned_department=assigned_department,
        assigned_to=None,
        created_by=request.created_by
    )

    db.add(new_request)
    db.flush()
    create_timeline_event(
        db,
        "request",
        new_request.id,
        "created",
        f"{request_no} oluşturuldu ve onay beklemeye alındı.",
        request.created_by
    )
    create_audit_log(
        db,
        request.created_by,
        request.full_name,
        "user",
        "request_created",
        f"{request.full_name} request oluşturdu. Tür: {request.request_type}.",
        "request",
        new_request.id,
        request_no
    )
    db.commit()
    db.refresh(new_request)

    return new_request

@app.get("/requests", response_model=list[schemas.RequestResponse])
def get_requests(db: Session = Depends(get_db)):
    return db.query(models.ITRequest).order_by(models.ITRequest.created_at.desc()).all()


@app.get("/requests/{request_id}", response_model=schemas.RequestResponse)
def get_request(request_id: int, db: Session = Depends(get_db)):
    request = db.query(models.ITRequest).filter(models.ITRequest.id == request_id).first()

    if not request:
        raise HTTPException(status_code=404, detail="Request bulunamadı")

    return request


@app.put("/requests/{request_id}/status", response_model=schemas.RequestResponse)
def update_request_status(
    request_id: int,
    status_update: schemas.RequestUpdateStatus,
    db: Session = Depends(get_db)
):
    request = db.query(models.ITRequest).filter(models.ITRequest.id == request_id).first()

    if not request:
        raise HTTPException(status_code=404, detail="Request bulunamadı")

    before = {
        "approval_status": request.approval_status,
        "assigned_department": request.assigned_department,
        "assigned_to": request.assigned_to
    }

    request.approval_status = status_update.approval_status
    request.assigned_department = status_update.assigned_department
    request.assigned_to = status_update.assigned_to
    request.updated_at = datetime.utcnow()
    change_description = describe_changes(before, request, {
        "approval_status": "Onay durumu",
        "assigned_department": "Atanan birim",
        "assigned_to": "Atanan kişi"
    })

    if change_description:
        create_timeline_event(
            db,
            "request",
            request_id,
            "updated",
            change_description,
            request.assigned_to or request.created_by or "system"
        )
        create_audit_log(
            db,
            request.assigned_to or request.created_by or "system",
            request.assigned_to or request.created_by or "System",
            "admin_or_staff",
            "request_status_updated",
            change_description,
            "request",
            request_id,
            request.request_no
        )

    db.commit()
    db.refresh(request)

    return request


@app.delete("/requests/{request_id}")
def delete_request(request_id: int, db: Session = Depends(get_db)):
    request = db.query(models.ITRequest).filter(models.ITRequest.id == request_id).first()

    if not request:
        raise HTTPException(status_code=404, detail="Request bulunamadı")

    db.query(models.Message).filter(
        models.Message.item_type == "request",
        models.Message.item_id == request_id
    ).delete()
    db.query(models.TimelineEvent).filter(
        models.TimelineEvent.item_type == "request",
        models.TimelineEvent.item_id == request_id
    ).delete()
    create_audit_log(
        db,
        "system",
        "System",
        "system",
        "request_deleted",
        f"{request.request_no} silindi.",
        "request",
        request_id,
        request.request_no
    )
    db.delete(request)
    db.commit()

    return {"message": "Request silindi"}


@app.get("/requests/{request_id}/messages", response_model=list[schemas.MessageResponse])
def get_request_messages(request_id: int, db: Session = Depends(get_db)):
    request = get_message_parent("request", request_id, db)

    if not request:
        raise HTTPException(status_code=404, detail="Request bulunamadı")

    return db.query(models.Message).filter(
        models.Message.item_type == "request",
        models.Message.item_id == request_id
    ).order_by(models.Message.created_at.asc()).all()


@app.post("/requests/{request_id}/messages", response_model=schemas.MessageResponse)
def create_request_message(
    request_id: int,
    message: schemas.MessageCreate,
    db: Session = Depends(get_db)
):
    request = get_message_parent("request", request_id, db)

    if not request:
        raise HTTPException(status_code=404, detail="Request bulunamadı")

    body = message.body.strip()

    if not body:
        raise HTTPException(status_code=400, detail="Mesaj boş olamaz")

    new_message = models.Message(
        item_type="request",
        item_id=request_id,
        sender_name=message.sender_name.strip() or "Bilinmeyen",
        sender_role=message.sender_role,
        body=body
    )

    db.add(new_message)
    create_timeline_event(
        db,
        "request",
        request_id,
        "message",
        f"{new_message.sender_name} mesaj ekledi.",
        new_message.sender_name
    )
    request.updated_at = datetime.utcnow()
    create_audit_log(
        db,
        new_message.sender_name,
        new_message.sender_name,
        new_message.sender_role,
        "request_message_created",
        f"{request.request_no} için mesaj eklendi.",
        "request",
        request_id,
        request.request_no
    )
    db.commit()
    db.refresh(new_message)

    return new_message

@app.get("/{item_type}/{item_id}/timeline", response_model=list[schemas.TimelineEventResponse])
def get_timeline(item_type: str, item_id: int, db: Session = Depends(get_db)):
    if item_type not in {"tickets", "requests"}:
        raise HTTPException(status_code=400, detail="Geçersiz timeline tipi")

    normalized_type = "ticket" if item_type == "tickets" else "request"
    parent = get_item_parent(normalized_type, item_id, db)

    if not parent:
        raise HTTPException(status_code=404, detail="Kayıt bulunamadı")

    return db.query(models.TimelineEvent).filter(
        models.TimelineEvent.item_type == normalized_type,
        models.TimelineEvent.item_id == item_id
    ).order_by(models.TimelineEvent.created_at.asc()).all()


@app.get("/staff-performance", response_model=list[schemas.StaffPerformanceResponse])
def get_staff_performance(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    tickets = db.query(models.Ticket).all()
    requests = db.query(models.ITRequest).all()
    staff_users = db.query(models.User).filter(
        models.User.role.in_(["ms", "technical", "network", "it_staff", "staff"])
    ).all()

    performance = {}

    def ensure_staff(name: str, department: str = None):
        staff_name = name or "Atanmamış"

        if staff_name not in performance:
            performance[staff_name] = {
                "staff": staff_name,
                "department": department,
                "assigned_tickets": 0,
                "solved_tickets": 0,
                "active_tickets": 0,
                "assigned_requests": 0,
                "completed_requests": 0,
                "active_requests": 0,
                "total_resolution_hours": 0.0,
                "resolved_ticket_count": 0
            }
        elif department and not performance[staff_name]["department"]:
            performance[staff_name]["department"] = department

        return performance[staff_name]

    for user in staff_users:
        ensure_staff(user.full_name, user.department)

    for ticket in tickets:
        staff_name = ticket.assigned_to or ticket.assigned_department or "Atanmamış"
        row = ensure_staff(staff_name, ticket.assigned_department)
        row["assigned_tickets"] += 1

        if ticket.status == "Çözüldü":
            row["solved_tickets"] += 1

            if ticket.created_at and ticket.updated_at:
                resolution_hours = (
                    ticket.updated_at - ticket.created_at
                ).total_seconds() / 3600
                row["total_resolution_hours"] += max(resolution_hours, 0)
                row["resolved_ticket_count"] += 1
        else:
            row["active_tickets"] += 1

    for request in requests:
        staff_name = request.assigned_to or request.assigned_department or "Atanmamış"
        row = ensure_staff(staff_name, request.assigned_department)
        row["assigned_requests"] += 1

        if request.approval_status == "Tamamlandı":
            row["completed_requests"] += 1
        elif request.approval_status in {"Onaylandı", "Onay Bekliyor"}:
            row["active_requests"] += 1

    response = []

    for row in performance.values():
        total_work_items = row["assigned_tickets"] + row["assigned_requests"]
        completed_items = row["solved_tickets"] + row["completed_requests"]
        completion_rate = (
            round((completed_items / total_work_items) * 100, 1)
            if total_work_items else 0
        )
        avg_ticket_resolution_hours = (
            round(row["total_resolution_hours"] / row["resolved_ticket_count"], 1)
            if row["resolved_ticket_count"] else None
        )

        response.append({
            "staff": row["staff"],
            "department": row["department"],
            "assigned_tickets": row["assigned_tickets"],
            "solved_tickets": row["solved_tickets"],
            "active_tickets": row["active_tickets"],
            "assigned_requests": row["assigned_requests"],
            "completed_requests": row["completed_requests"],
            "active_requests": row["active_requests"],
            "total_work_items": total_work_items,
            "completion_rate": completion_rate,
            "avg_ticket_resolution_hours": avg_ticket_resolution_hours
        })

    return sorted(
        response,
        key=lambda item: (item["total_work_items"], item["completion_rate"]),
        reverse=True
    )


@app.get("/ai-agent-reports", response_model=list[schemas.AIAgentReportResponse])
def get_ai_agent_reports(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    return db.query(models.AIAgentReport).order_by(
        models.AIAgentReport.created_at.desc()
    ).all()


@app.get("/audit-logs", response_model=list[schemas.AuditLogResponse])
def get_audit_logs(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    return db.query(models.AuditLog).order_by(
        models.AuditLog.created_at.desc()
    ).limit(500).all()


# -------------------------
# KNOWLEDGE BASE
# -------------------------

@app.post("/kb/articles", response_model=schemas.KnowledgeArticleResponse)
def create_kb_article(
    article: schemas.KnowledgeArticleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    new_article = models.KnowledgeArticle(
        title=article.title.strip(),
        category=article.category.strip(),
        keywords=article.keywords.strip(),
        content=article.content.strip(),
        solution_steps=(article.solution_steps or "").strip() or None,
        is_active=article.is_active
    )

    db.add(new_article)
    db.commit()
    db.refresh(new_article)

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "kb_article_created",
        f"KB makalesi oluşturuldu: {new_article.title} / {new_article.category}.",
        "knowledge_article",
        new_article.id,
        new_article.title
    )
    db.commit()

    return new_article


@app.get("/kb/articles", response_model=list[schemas.KnowledgeArticleResponse])
def get_kb_articles(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    return db.query(models.KnowledgeArticle).order_by(
        models.KnowledgeArticle.updated_at.desc()
    ).all()


@app.get("/kb/articles/{article_id}", response_model=schemas.KnowledgeArticleResponse)
def get_kb_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    article = db.query(models.KnowledgeArticle).filter(
        models.KnowledgeArticle.id == article_id
    ).first()

    if not article:
        raise HTTPException(status_code=404, detail="KB makalesi bulunamadı")

    return article


@app.put("/kb/articles/{article_id}", response_model=schemas.KnowledgeArticleResponse)
def update_kb_article(
    article_id: int,
    article_update: schemas.KnowledgeArticleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    article = db.query(models.KnowledgeArticle).filter(
        models.KnowledgeArticle.id == article_id
    ).first()

    if not article:
        raise HTTPException(status_code=404, detail="KB makalesi bulunamadı")

    for field_name, field_value in article_update.model_dump(exclude_unset=True).items():
        if isinstance(field_value, str):
            field_value = field_value.strip()

        setattr(article, field_name, field_value)

    article.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(article)

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "kb_article_updated",
        f"KB makalesi güncellendi: {article.title} / {article.category}.",
        "knowledge_article",
        article.id,
        article.title
    )
    db.commit()

    return article


@app.delete("/kb/articles/{article_id}")
def delete_kb_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles("admin"))
):
    article = db.query(models.KnowledgeArticle).filter(
        models.KnowledgeArticle.id == article_id
    ).first()

    if not article:
        raise HTTPException(status_code=404, detail="KB makalesi bulunamadı")

    article_title = article.title
    article_category = article.category
    article_id_value = article.id

    db.delete(article)
    db.commit()

    create_audit_log(
        db,
        current_user.username,
        current_user.full_name,
        current_user.role,
        "kb_article_deleted",
        f"KB makalesi silindi: {article_title} / {article_category}.",
        "knowledge_article",
        article_id_value,
        article_title
    )
    db.commit()

    return {"message": "KB makalesi silindi"}


@app.get("/kb/search", response_model=list[schemas.KnowledgeArticleResponse])
def search_kb(query: str, db: Session = Depends(get_db)):
    return search_kb_articles(db, query)


@app.post("/kb/ask", response_model=schemas.KBAskResponse)
def ask_kb(
    question_payload: schemas.KBAskRequest,
    db: Session = Depends(get_db)
):
    sanitized_question = sanitize_kb_question(question_payload.question)

    if not sanitized_question:
        raise HTTPException(status_code=400, detail="Soru boş olamaz")

    matched_articles = search_kb_articles(db, sanitized_question)
    answer = build_kb_answer(sanitized_question, matched_articles)

    return {
        "answer": answer["answer"],
        "resolved": answer["resolved"],
        "confidence": answer["confidence"],
        "matched_articles": matched_articles,
        "data_scope": KB_DATA_SCOPE
    }
