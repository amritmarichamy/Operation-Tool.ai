from ..extensions import db
from datetime import datetime
from sqlalchemy import func

class PendingChange(db.Model):
    __tablename__ = "pending_changes"
    id = db.Column(db.Integer, primary_key=True)
    entity_type = db.Column(db.String(50), nullable=False)  # 'candidate'
    entity_id = db.Column(db.Integer, nullable=False)
    # JSON dump of new field values
    change_data = db.Column(db.Text, nullable=False)
    # 'pending', 'applied', 'rejected'
    status = db.Column(db.String(20), default="pending")
    requested_by_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())
