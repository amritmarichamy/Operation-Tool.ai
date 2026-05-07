from ..extensions import db
from datetime import datetime
from sqlalchemy import func

class Workspace(db.Model):
    __tablename__ = "workspaces"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    # The default industry filter when selecting targets for a run.
    industry_filter = db.Column(db.Text, nullable=True)
    country = db.Column(db.String(100), nullable=True)
    # When this workspace's automation runs should be considered "Day 1" on the curve.
    service_start_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "industry_filter": self.industry_filter or "",
            "country": self.country or "",
            "service_start_date": self.service_start_date.isoformat() if self.service_start_date else "",
            "created_at": self.created_at.isoformat() if self.created_at else "",
        }

class Industry(db.Model):
    __tablename__ = "industries"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), unique=True, nullable=False)
