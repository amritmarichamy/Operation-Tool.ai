import os
from flask import Flask
from .config import Config
from .extensions import db, cors

def create_app(config_class=Config):
    app = Flask(__name__,
                static_folder=config_class.FRONTEND_DIR + "/static",
                template_folder=config_class.FRONTEND_DIR + "/templates")
    app.config.from_object(config_class)

    # Initialize extensions
    db.init_app(app)
    cors.init_app(app)

    # Create directories if they don't exist
    os.makedirs(config_class.DATA_DIR, exist_ok=True)
    os.makedirs(config_class.UPLOAD_ROOT, exist_ok=True)
    os.makedirs(config_class.REPORTS_DIR, exist_ok=True)
    os.makedirs(config_class.SCANNER_UPLOAD_FOLDER, exist_ok=True)
    os.makedirs(config_class.SCANNER_OUTPUT_FOLDER, exist_ok=True)

    # Register blueprints
    from .routes.auth import auth_bp
    from .routes.candidates import candidates_bp
    from .routes.pages import pages_bp
    app.register_blueprint(auth_bp)
    app.register_blueprint(candidates_bp)
    app.register_blueprint(pages_bp)

    with app.app_context():
        # Import models here to register them with the database
        from . import models
        # db.create_all() # Typically managed by migrations

    return app
