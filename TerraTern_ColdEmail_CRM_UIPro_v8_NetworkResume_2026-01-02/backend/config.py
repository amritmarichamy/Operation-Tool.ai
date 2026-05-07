import os

class Config:
    APP_NAME = "Terra Tern Email CRM"
    BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    
    # ---- Data directories (runtime data lives under data/) ----
    DATA_DIR = os.path.join(BASE_DIR, "data")
    CRM_SQLITE_PATH = os.path.join(DATA_DIR, "crm.sqlite3")
    UPLOAD_ROOT = os.path.join(DATA_DIR, "uploads")
    REPORTS_DIR = os.path.join(DATA_DIR, "reports")
    
    # CRM export column "Enrollment ID" = full JSA URL when candidate has a plain id
    CRM_JSA_ENROLLMENT_UPDATE_PREFIX = os.environ.get(
        "CRM_JSA_ENROLLMENT_UPDATE_PREFIX",
        "https://backend.terratern.com/jsa-enrollment/update?id=",
    ).strip()

    # Scanner output folder
    SCANNER_UPLOAD_FOLDER = os.path.join(DATA_DIR, "scanner_uploads")
    SCANNER_OUTPUT_FOLDER = os.path.join(DATA_DIR, "scanner_outputs")

    # ---- Frontend directories ----
    FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")
    
    SECRET_KEY = os.environ.get("SECRET_KEY", "terra-tern-crm-secret-key-2026")
    SQLALCHEMY_DATABASE_URI = "sqlite:///" + CRM_SQLITE_PATH
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Email settings (Gmail)
    SMTP_HOST = "smtp.gmail.com"
    SMTP_PORT = 587
    IMAP_HOST = "imap.gmail.com"

    # OTP SMTP settings
    OTP_EMAIL = os.environ.get("OTP_EMAIL", "amrit.marichamy@terratern.com")
    OTP_PASS = os.environ.get("OTP_PASS", "qrop gcxm xrpz jmpu")

    # Retry settings
    MAX_RETRIES = 5
    RETRY_BASE_SECONDS = 3
    NETWORK_WAIT_SECONDS = 8

    # Validations
    ENABLE_MX_CHECK = False
    STRICT_BLOCK_INVALID_TARGETS = True
    ENABLE_BOUNCE_CHECK_DEFAULT = True

    # Per-candidate daily ceiling
    SMART_AUTOMATION_BACKLOG_SAFE_CAP = 100
    AUTOMATION_DAILY_CAP_WHEN_NO_BACKLOG = 500
    AUTOMATION_DEFAULT_DELAY_SECONDS = 10
