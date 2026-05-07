from flask import Blueprint, request, jsonify
from ..extensions import db
from ..models import Candidate
from ..utils.helpers import parse_roles
from sqlalchemy import func

candidates_bp = Blueprint('candidates', __name__)

@candidates_bp.route('/api/candidates', methods=['GET'])
def get_candidates():
    candidates = Candidate.query.all()
    return jsonify([c.to_dict_summary() for c in candidates])

@candidates_bp.route('/api/candidates/<int:id>', methods=['GET'])
def get_candidate(id):
    candidate = db.session.get(Candidate, id)
    if not candidate:
        return jsonify({"error": "Candidate not found"}), 404
    return jsonify(candidate.to_dict_detail())

@candidates_bp.route('/api/candidates', methods=['POST'])
def create_candidate():
    # Simplified creation logic
    data = request.form.to_dict()
    new_candidate = Candidate(
        name=data.get('name'),
        email=data.get('email').lower(),
        pa_member=data.get('pa_member'),
        rm_member=data.get('rm_member'),
        placement_officer_member=data.get('placement_officer_member'),
        app_password=data.get('app_password'),
        subject_template=data.get('subject_template'),
        message_template=data.get('message_template'),
        roles_text=data.get('roles_text'),
        industry_types=data.get('industry_types'),
        smart_country=data.get('smart_country')
    )
    db.session.add(new_candidate)
    db.session.commit()
    return jsonify(new_candidate.to_dict_detail()), 201
