from flask import Blueprint, request, jsonify, session
from ..extensions import db
from ..models import User
from werkzeug.security import generate_password_hash, check_password_hash
import random
from datetime import datetime, timedelta

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    
    user = User.query.filter_by(username=username).first()
    if user and check_password_hash(user.password_hash, password):
        if not user.is_approved:
            return jsonify({"error": "Account pending approval"}), 403
        
        # In a real app, send OTP email here
        otp = f"{random.randint(100000, 999999)}"
        user.otp = otp
        user.otp_expiry = datetime.utcnow() + timedelta(minutes=10)
        db.session.commit()
        
        # For demo purposes, returning OTP in response (REMOVE IN PROD)
        return jsonify({"message": "OTP sent", "otp_debug": otp})
    
    return jsonify({"error": "Invalid credentials"}), 401

@auth_bp.route('/api/auth/verify-otp', methods=['POST'])
def verify_otp():
    data = request.json or {}
    username = data.get('username')
    otp = data.get('otp')
    
    user = User.query.filter_by(username=username).first()
    if user and user.otp == otp and user.otp_expiry > datetime.utcnow():
        session['user_id'] = user.id
        session['role'] = user.role
        user.otp = None
        db.session.commit()
        return jsonify({"message": "Login successful", "user": user.to_dict()})
    
    return jsonify({"error": "Invalid or expired OTP"}), 401

@auth_bp.route('/api/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"message": "Logged out"})

@auth_bp.route('/api/auth/me', methods=['GET'])
def me():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({"error": "Unauthorized"}), 401
    
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    return jsonify({"user": user.to_dict()})
