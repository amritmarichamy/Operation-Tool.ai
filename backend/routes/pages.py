from flask import Blueprint, render_template, session, redirect, url_for
from ..models import User

pages_bp = Blueprint('pages', __name__)

@pages_bp.route('/')
def index():
    if 'user_id' not in session:
        return redirect(url_for('pages.login'))
    return render_template('dashboard.html')

@pages_bp.route('/login')
def login():
    if 'user_id' in session:
        return redirect(url_for('pages.index'))
    return render_template('login.html')

@pages_bp.route('/terra')
def terra():
    # Enrollment page logic
    return render_template('terra.html')
