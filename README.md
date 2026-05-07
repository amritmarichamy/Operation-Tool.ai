# 🌍 Terra Tern Email CRM

A full-featured Cold Email CRM for managing candidates, sending personalized email campaigns, tracking results, and automating 6-month workflow plans.

---

## 📁 Project Structure

```
terratern-crm/
├── backend/                    # (Future) Modular backend package
├── config/                     # Application configuration files
│   └── role_group_overrides.json
├── data/                       # Runtime data (.gitignored)
│   ├── crm.sqlite3             # SQLite database
│   ├── backups/                # DB backups
│   ├── reports/                # CSV reports per send run
│   ├── uploads/                # Candidate file uploads
│   ├── scanner_uploads/        # Resume scanner input
│   └── scanner_outputs/        # Resume scanner output
├── frontend/                   # All UI assets
│   ├── static/
│   │   ├── css/                # Stylesheets
│   │   ├── js/                 # JavaScript
│   │   ├── img/                # Logos & icons
│   │   └── templates/          # Excel templates
│   └── templates/              # Jinja2 HTML templates
│       ├── dashboard.html
│       ├── login.html
│       └── terra.html
├── scripts/                    # Operational & maintenance scripts
│   ├── run_server.bat          # Quick start (Windows)
│   ├── run_server.sh           # Quick start (macOS/Linux)
│   ├── restart_server.bat      # Kill & restart
│   ├── run_server_24x7.cmd     # Auto-restart wrapper (CMD)
│   ├── run_server_24x7.ps1     # Auto-restart wrapper (PS)
│   ├── fix_network_access.bat  # Add firewall rule
│   ├── install_autostart.cmd   # Register as startup service
│   ├── Install-CrmAutoStart.ps1
│   ├── Uninstall-CrmAutoStart.ps1
│   └── db/                     # Database maintenance tools
│       ├── migrate_db.py
│       ├── trigger_migrations.py
│       ├── update_emails.py
│       ├── jsa_job_application_batch.py
│       ├── prune_candidates.py
│       └── wipe_database.py
├── server.py                   # Application entry point
├── requirements.txt            # Python dependencies
├── .env.example                # Environment variable template
├── .gitignore
└── README.md
```

---

## 🚀 Quick Start

### Prerequisites
- **Python 3.10+**
- **pip** (comes with Python)

### Setup

```bash
# 1. Clone and enter the project
cd terratern-crm

# 2. Create a virtual environment
python -m venv .venv

# 3. Activate it
# Windows:
.venv\Scripts\activate
# macOS/Linux:
source .venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Configure environment (optional)
copy .env.example .env
# Edit .env with your SMTP credentials

# 6. Run the server
python server.py
```

The CRM will be available at: **http://127.0.0.1:8080**

### Windows Quick Launch
Double-click `scripts/run_server.bat` — it creates the venv, installs deps, and starts the server automatically.

---

## ⚙️ Configuration

All configurable values are documented in `.env.example`. Key settings:

| Variable | Default | Description |
|---|---|---|
| `CRM_PORT` | `8080` | Server port |
| `OTP_EMAIL` | — | Gmail address for OTP delivery |
| `OTP_PASS` | — | Gmail App Password (not real password) |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server |
| `ENABLE_MX_CHECK` | `false` | Validate recipient MX records |
| `SMART_AUTOMATION_BACKLOG_SAFE_CAP` | `100` | Max emails per automation run |

> ⚠️ **Gmail App Password**: Go to Google Account → Security → App Passwords to generate one. Never use your real Gmail password.

---

## 📦 Storage

| Path | Contents | Git-tracked? |
|---|---|---|
| `data/crm.sqlite3` | SQLite database | ❌ |
| `data/uploads/` | Candidate uploaded files | ❌ |
| `data/reports/` | CSV reports per send run | ❌ |
| `data/backups/` | DB backup snapshots | ❌ |
| `config/` | JSON config overrides | ✅ |

### Database Backup
```
GET /api/candidates/backup_sqlite
GET /api/backup/database
```

### CRM Manifest Export
```
GET /api/reports/crm-manifest
GET /api/crm-manifest-export
```

---

## 🔧 Maintenance Scripts

| Script | Purpose |
|---|---|
| `scripts/db/migrate_db.py` | Run database migrations |
| `scripts/db/prune_candidates.py` | Remove old candidates, keep recent |
| `scripts/db/wipe_database.py` | Wipe all data except users |
| `scripts/db/jsa_job_application_batch.py` | Batch import job applications |

---

## 📋 Candidates Excel Import

Supported column layouts:

1. **New format**: Name, Email, PA Member, Placement Officer Member, App Password, Subject, Message, Roles
2. **Legacy format**: Name, Email, App Code (treated as PA Member), App Password, Subject, Message, Roles

---

## 🏗️ Architecture Notes

The current backend is a single `server.py` monolith (~7,700 lines) containing:
- SQLAlchemy models
- Flask API routes
- Email sending engine
- Background scheduler
- JSA sync service
- Smart Automation engine

**Future modularization** is scaffolded via the `backend/` directory for splitting into:
- `backend/models/` — Database models
- `backend/routes/` — API route blueprints
- `backend/services/` — Business logic
- `backend/utils/` — Shared utilities

---

## 📄 License

Proprietary — Terra Tern © 2026