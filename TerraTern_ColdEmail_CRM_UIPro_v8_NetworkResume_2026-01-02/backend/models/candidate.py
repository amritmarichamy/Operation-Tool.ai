from ..extensions import db
from datetime import datetime
from sqlalchemy import func
from typing import Optional
from ..utils.helpers import (
    format_candidate_country_type,
    normalize_enrollment_status,
    candidate_days_for_bucklist,
    candidate_days_in_system_source
)

class Candidate(db.Model):
    __tablename__ = "candidates"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    email = db.Column(db.String(200), nullable=False)
    app_code = db.Column(db.String(100), nullable=True)
    pa_member = db.Column(db.String(200), nullable=True)
    rm_member = db.Column(db.String(200), nullable=True)
    placement_officer_member = db.Column(db.String(200), nullable=True)
    app_password = db.Column(db.String(200), nullable=True)
    subject_template = db.Column(db.Text, nullable=True)
    message_template = db.Column(db.Text, nullable=True)
    roles_text = db.Column(db.Text, nullable=True)
    resume_path = db.Column(db.String(500), nullable=True)
    cover_letter_path = db.Column(db.String(500), nullable=True)
    enrollment_id = db.Column(db.String(100), nullable=True)
    enrollment_status = db.Column(db.String(40), nullable=True)
    industry_types = db.Column(db.Text, nullable=True)
    scheduled_time = db.Column(db.DateTime, nullable=True)
    smart_service_start_date = db.Column(db.DateTime, nullable=True)
    smart_baseline_applied = db.Column(db.Integer, default=0)
    smart_country = db.Column(db.String(100), nullable=True)
    smart_industry = db.Column(db.String(150), nullable=True)
    bucklist_days_in_system = db.Column(db.Integer, nullable=True)
    scheduler_automation_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=func.now())
    updated_at = db.Column(db.DateTime, nullable=False, default=func.now(), onupdate=func.now())

    def to_dict_summary(self, workspace_country=None, workflow_service_start=None, workspace_service_start=None):
        pa = (self.pa_member or self.app_code or "")
        country_type = format_candidate_country_type(self.smart_country, None)
        days_comp = candidate_days_for_bucklist(self, workflow_service_start, workspace_service_start)
        days_src = candidate_days_in_system_source(self, workflow_service_start, workspace_service_start)
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "pa_member": pa,
            "rm_member": (self.rm_member or "").strip(),
            "placement_officer_member": self.placement_officer_member or "",
            "enrollment_id": self.enrollment_id or "",
            "enrollment_status": normalize_enrollment_status(self.enrollment_status),
            "industry_types": (self.industry_types or "").strip(),
            "smart_service_start_date": self.smart_service_start_date.isoformat() if self.smart_service_start_date else "",
            "smart_baseline_applied": int(self.smart_baseline_applied or 0),
            "smart_country": (self.smart_country or "").strip(),
            "smart_industry": (self.smart_industry or "").strip(),
            "bucklist_days_in_system": int(self.bucklist_days_in_system) if self.bucklist_days_in_system is not None else None,
            "days_in_system_computed": days_comp,
            "days_in_system_source": days_src,
            "country_type": country_type,
            "workspace_country": (workspace_country or "").strip(),
            "has_app_password": bool(self.app_password),
            "has_resume": bool(self.resume_path),
            "has_cover_letter": bool(self.cover_letter_path),
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }

    def to_dict_detail(self):
        pa = (self.pa_member or self.app_code or "")
        # Need to handle service starts properly (maybe move that logic to a service)
        days_comp = candidate_days_for_bucklist(self)
        days_src = candidate_days_in_system_source(self)
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "pa_member": pa,
            "rm_member": (self.rm_member or "").strip(),
            "placement_officer_member": self.placement_officer_member or "",
            "enrollment_id": self.enrollment_id or "",
            "enrollment_status": normalize_enrollment_status(self.enrollment_status),
            "app_password": self.app_password or "",
            "subject_template": self.subject_template or "",
            "message_template": self.message_template or "",
            "roles_text": self.roles_text or "",
            "industry_types": (self.industry_types or "").strip(),
            "smart_service_start_date": self.smart_service_start_date.isoformat() if self.smart_service_start_date else "",
            "smart_baseline_applied": int(self.smart_baseline_applied or 0),
            "smart_country": (self.smart_country or "").strip(),
            "smart_industry": (self.smart_industry or "").strip(),
            "scheduled_time": self.scheduled_time.isoformat() if self.scheduled_time else "",
            "bucklist_days_in_system": int(self.bucklist_days_in_system) if self.bucklist_days_in_system is not None else None,
            "days_in_system_computed": days_comp,
            "days_in_system_source": days_src,
            "resume_on_file": bool(self.resume_path),
            "cover_on_file": bool(self.cover_letter_path),
            "updated_at": self.updated_at.isoformat() if self.updated_at else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }

class WorkflowPlan(db.Model):
    __tablename__ = "workflow_plans"
    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False)
    # 'active', 'paused', 'completed', 'cancelled'
    status = db.Column(db.String(40), default="active")
    service_start_date = db.Column(db.DateTime, nullable=False)
    # JSON or text field describing custom phase overrides if any
    plan_config = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "candidate_id": self.candidate_id,
            "status": self.status,
            "service_start_date": self.service_start_date.isoformat() if self.service_start_date else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }
