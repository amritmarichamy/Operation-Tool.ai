import os
import re
from datetime import datetime, timedelta
from typing import Optional, List, Tuple, Set

def format_candidate_country_type(smart_country: Optional[str], workspace_country: Optional[str] = None) -> str:
    """Display label: country as stored (e.g. India, UAE). Legacy rows may have 'Work X' — strip the prefix."""
    raw = (smart_country or "").strip() or (workspace_country or "").strip()
    if not raw:
        return ""
    low = raw.lower()
    if low.startswith("work "):
        return raw[5:].strip()
    return raw

def normalize_enrollment_status(raw: Optional[str]) -> str:
    from .constants import ENROLLMENT_STATUSES
    s = (raw or "").strip()
    return s if s in ENROLLMENT_STATUSES else "Ongoing"

def _dt_naive_for_delta(dt: Optional[datetime]) -> Optional[datetime]:
    """Normalize to naive datetime for day-delta math (matches existing app storage)."""
    if dt is None:
        return None
    if getattr(dt, "tzinfo", None):
        return dt.replace(tzinfo=None)
    return dt

def candidate_service_anchor_dt(
    c,
    workflow_service_start: Optional[datetime] = None,
    workspace_service_start: Optional[datetime] = None,
) -> Optional[datetime]:
    """Calendar anchor for 'days in system': profile start, then 6-month plan, then workspace service start."""
    if c.smart_service_start_date:
        return _dt_naive_for_delta(c.smart_service_start_date)
    if workflow_service_start:
        return _dt_naive_for_delta(workflow_service_start)
    if workspace_service_start:
        return _dt_naive_for_delta(workspace_service_start)
    return None

def candidate_days_for_bucklist(
    c,
    workflow_service_start: Optional[datetime] = None,
    workspace_service_start: Optional[datetime] = None,
) -> Optional[int]:
    """Live days from service anchor when present; otherwise pinned bucklist days or age since created."""
    anchor = candidate_service_anchor_dt(c, workflow_service_start, workspace_service_start)
    if anchor is not None:
        return max(0, (datetime.utcnow() - anchor).days)
    if c.bucklist_days_in_system is not None:
        return max(0, int(c.bucklist_days_in_system))
    if c.created_at:
        start = _dt_naive_for_delta(c.created_at)
        return max(0, (datetime.utcnow() - start).days)
    return None

def candidate_days_in_system_source(
    c,
    workflow_service_start: Optional[datetime] = None,
    workspace_service_start: Optional[datetime] = None,
) -> Optional[str]:
    anchor = candidate_service_anchor_dt(c, workflow_service_start, workspace_service_start)
    if anchor is not None:
        if c.smart_service_start_date:
            return "profile_service_start"
        if workflow_service_start:
            return "workflow_plan"
        if workspace_service_start:
            return "workspace_service"
        return "elapsed"
    if c.bucklist_days_in_system is not None:
        return "bucklist_pin"
    if c.created_at:
        return "created_age"
    return None

def bucket_key_for_days(days: int) -> str:
    d = max(0, int(days))
    if d <= 30:
        return "0-30"
    if d <= 60:
        return "31-60"
    if d <= 90:
        return "61-90"
    if d <= 120:
        return "91-120"
    if d <= 150:
        return "121-150"
    if d <= 180:
        return "151-180"
    return ">180"

def parse_roles(text: str):
    raw = (text or "").replace(";", "\n").replace("|", "\n")
    out = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [p.strip() for p in line.split(",")] if "," in line else [line]
        for p in parts:
            if p and p not in out:
                out.append(p)
    return out

def upload_path_for_api(abs_path: Optional[str], base_dir: str) -> str:
    """Path relative to project root for API/UI (forward slashes). Empty if no file."""
    if not abs_path or not str(abs_path).strip():
        return ""
    raw = str(abs_path).strip()
    # Resolve project-relative paths against BASE_DIR (abspath() alone uses process cwd).
    if not os.path.isabs(raw):
        raw = os.path.normpath(os.path.join(base_dir, raw.replace("/", os.sep)))
    try:
        ap = os.path.normpath(os.path.abspath(raw))
        bd = os.path.normpath(base_dir)
        ap_n = os.path.normcase(ap)
        bd_n = os.path.normcase(bd)
        if ap_n == bd_n or ap_n.startswith(bd_n + os.sep):
            rel = os.path.relpath(ap, bd)
            out = rel.replace("\\", "/")
            if out and out != ".":
                return out
    except (ValueError, OSError, Exception):
        pass
    s = raw.replace("\\", "/")
    low = s.lower()
    if "uploads/" in low:
        i = low.index("uploads/")
        return s[i:].replace("\\", "/")
    try:
        return os.path.basename(s) or s
    except Exception:
        return s
