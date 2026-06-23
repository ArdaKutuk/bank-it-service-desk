[README.md](https://github.com/user-attachments/files/29248032/README.md)
# Bank IT Service Desk

Bank IT Service Desk, banka BT destek süreçleri için hazırlanmış çalışan bir prototip/MVP uygulamasıdır. Ticket yönetimi, request/onay akışı, ekip kuyrukları, Knowledge Base, AI agent destekli yönlendirme, raporlama, audit log ve kullanıcı yönetimi ekranlarını içerir.

Bu repo demo/prototip amaçlıdır. Production ortamı için kimlik yönetimi, gizli anahtarlar, yetkilendirme, loglama, yedekleme, migration ve deployment süreçleri kurum standartlarına göre ayrıca sertleştirilmelidir.

## Özellikler

- Kullanıcı, admin ve IT ekip girişleri
- Ticket oluşturma, listeleme, ekip atama ve durum takibi
- Request oluşturma, admin onayı/reddi ve ekip yönlendirme
- Microsoft Services, Network Operations ve Technical Support kuyrukları
- Knowledge Base arama ve admin makale yönetimi
- AI agent ile açıklamaya göre kategori/yönlendirme kontrolü
- AI agent müdahale raporları
- Staff performance ve admin rapor ekranları
- Audit log ve timeline kayıtları
- Jenerik banka logosu ve marka bağımsız arayüz

## Teknoloji

Frontend:

- Statik HTML
- Vanilla JavaScript
- CSS

Backend:

- Python
- FastAPI
- SQLAlchemy
- Pydantic
- JWT tabanlı oturum
- Passlib/bcrypt

Veritabanı:

- Varsayılan: SQLite
- Opsiyonel: `DATABASE_URL` ile PostgreSQL veya farklı SQLAlchemy destekli veritabanı

## Proje Yapısı

```text
.
├── index.html                  # Son kullanıcı ana ekranı
├── login.html                  # Genel giriş ekranı
├── admin*.html / admin*.js     # Admin ekranları
├── staff*.html / staff*.js     # IT staff ekranları
├── ms-dashboard.html           # Microsoft Services kuyruğu
├── network-dashboard.html      # Network kuyruğu
├── technical-dashboard.html    # Technical Support kuyruğu
├── script.js                   # Ana frontend mantığı
├── style.css                   # Ortak stiller
├── assets/bank-logo.svg        # Jenerik banka logosu
├── backend/
│   ├── main.py                 # FastAPI uygulaması
│   ├── database.py             # Veritabanı bağlantısı
│   ├── models.py               # SQLAlchemy modelleri
│   ├── schemas.py              # Pydantic şemaları
│   ├── requirements.txt        # Python bağımlılıkları
│   ├── alembic/                # Migration altyapısı
│   └── docs/postgres-setup.md  # PostgreSQL notları
└── docs/
    ├── demo-users-credentials.csv
    └── devir-teslim.md
```

## Kurulum

Python 3.9 veya üzeri önerilir.

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Opsiyonel ortam ayarı:

```bash
cp .env.example .env
```

Not: Uygulama `.env` dosyasını otomatik okumaz. Gerekirse değişkenleri terminalde export edin veya deployment ortamında tanımlayın.

```bash
export DATABASE_URL="sqlite:///./tickets.db"
export AUTO_CREATE_SCHEMA=1
```

## Çalıştırma

Backend:

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

API kontrolü:

```bash
curl http://127.0.0.1:8000/
```

Beklenen cevap:

```json
{"message":"Bank IT Service Desk API çalışıyor"}
```

Frontend:

- `login.html`, `index.html` veya ilgili HTML dosyalarını tarayıcıda açın.
- Frontend API adresi mevcut dosyalarda `http://127.0.0.1:8000` olarak kullanılır.
- Backend çalışmadan giriş, ticket, request ve rapor akışları çalışmaz.

## Demo Kullanıcılar

Demo kullanıcı listesi:

```text
docs/demo-users-credentials.csv
```

Örnek girişler:

| Rol | Kullanıcı | Şifre |
| --- | --- | --- |
| Admin | `admin01` | `Passw0rd!` |
| Kullanıcı | `user01` | `Passw0rd!` |
| MS Staff | `ms01` | `Passw0rd!` |
| Network Staff | `network01` | `Passw0rd!` |
| Technical Staff | `technical01` | `Passw0rd!` |

## Veritabanı

Varsayılan durumda SQLite kullanılır ve uygulama `backend/tickets.db` dosyasını oluşturur. Bu dosya yerel çalışma verisidir ve GitHub'a eklenmez.

PostgreSQL için:

```bash
export DATABASE_URL="postgresql+psycopg://USER:PASSWORD@HOST:5432/DB_NAME"
```

Ek notlar için:

```text
backend/docs/postgres-setup.md
```

## GitHub'a Yükleme Notları

Bu repo için `.gitignore` aşağıdaki yerel çıktıları dışarıda bırakır:

- Python sanal ortamları: `venv/`, `.venv/`, `backend/venv/`
- Yerel veritabanları: `*.db`, `*.sqlite`, `*.sqlite3`
- macOS sistem dosyaları: `.DS_Store`
- Yerel workspace dosyaları: `*.code-workspace`

İlk yükleme için:

```bash
git add .
git commit -m "Prepare project for GitHub"
git branch -M main
git remote add origin <github-repo-url>
git push -u origin main
```

Remote zaten ekliyse:

```bash
git remote -v
git push -u origin main
```

## Production Öncesi Yapılacaklar

- `SECRET_KEY` kaynak koddan çıkarılıp ortam değişkenine taşınmalı.
- Demo kullanıcı seed akışı kapatılmalı veya kontrollü hale getirilmeli.
- CORS ayarları açık `*` yerine izinli domainlerle sınırlandırılmalı.
- Frontend API base URL merkezi konfigürasyona taşınmalı.
- SQLite yerine yönetilen PostgreSQL gibi kalıcı bir veritabanı kullanılmalı.
- Audit, uygulama logları, yedekleme ve monitoring süreçleri eklenmeli.
- Yetki modeli, parola politikası ve kurum SSO entegrasyonu gözden geçirilmeli.

## Dokümantasyon

Daha detaylı operasyon ve devir teslim notları için:

```text
docs/devir-teslim.md
```
