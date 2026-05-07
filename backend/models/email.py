from ..extensions import db
from datetime import datetime
from sqlalchemy import func

class Target(db.Model):
    __tablename__ = "targets"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=True)
    email = db.Column(db.String(200), unique=True, nullable=False)
    industry = db.Column(db.String(150), nullable=True)
    country = db.Column(db.String(100), nullable=True)
    # comma-separated roles or structured text
    roles = db.Column(db.Text, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=func.now())

class SentHistory(db.Model):
    __tablename__ = "sent_history"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    target_id = db.Column(db.Integer, db.ForeignKey("targets.id"), nullable=False)
    # The workspace context this was sent under
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=True)
    # Copy of the email sent to avoid target changes breaking history
    target_email = db.Column(db.String(200), nullable=False)
    sent_at = db.Column(db.DateTime, default=func.now())
    # 'sent', 'bounced', 'failed'
    status = db.Column(db.String(40), default="sent")

class SendRun(db.Model):
    __tablename__ = "send_runs"
    id = db.Column(db.Integer, primary_key=True)
    workspace_id = db.Column(db.Integer, db.ForeignKey("workspaces.id"), nullable=True)
    # 'bulk', 'manual', 'automation'
    type = db.Column(db.String(40), default="manual")
    # 'pending', 'running', 'done', 'failed', 'stopped'
    status = db.Column(db.String(40), default="pending")
    # Stats incremented by worker threads
    total = db.Column(db.Integer, default=0)
    sent = db.Column(db.Integer, default=0)
    failed = db.Column(db.Integer, default=0)
    skipped = db.Column(db.Integer, default=0)
    bounced = db.Column(db.Integer, default=0)
    # Summary of exclusions or errors
    log = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())

class RunCandidateReport(db.Model):
    """Snapshot of how many targets were available vs sent for a candidate in a specific run."""
    __tablename__ = "run_candidate_reports"
    id = db.Column(db.Integer, primary_key=True)
    run_id = db.Column(db.Integer, db.ForeignKey("send_runs.id"), nullable=False)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    targets_available = db.Column(db.Integer, default=0)
    targets_sent = db.Column(db.Integer, default=0)
    # CSV lines per run-candidate: "Target Name, Email, Status, Log"
    report_csv_path = db.Column(db.String(500), nullable=True)

class JobApplication(db.Model):
    """External applications tracked by JSA sync."""
    __tablename__ = "job_applications"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    company_name = db.Column(db.String(300), nullable=True)
    job_title = db.Column(db.String(300), nullable=True)
    applied_at = db.Column(db.DateTime, nullable=True)
    # 'jsa'
    source = db.Column(db.String(50), default="jsa")
    created_at = db.Column(db.DateTime, default=func.now())

class EmailEvent(db.Model):
    """Captured from Sent folder/IMAP to reconcile history."""
    __tablename__ = "email_events"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    target_email = db.Column(db.String(255), nullable=False)
    company_name = db.Column(db.String(255), nullable=True)
    # 'sent', 'bounced', 'manual_import'
    event_type = db.Column(db.String(50), default="sent")
    event_at = db.Column(db.DateTime, default=func.now())
    # Internal hash to avoid double counting same email
    msg_id = db.Column(db.String(255), nullable=True, index=True)
