from server import app, db, User
from werkzeug.security import generate_password_hash

def setup():
    with app.app_context():
        db.create_all()
        admin = User.query.filter_by(username='admin').first()
        if not admin:
            print("Creating admin user...")
            admin = User(
                username='admin',
                email='admin@terratern.com',
                password_hash=generate_password_hash('admin123'),
                is_verified=True,
                is_approved=True,
                role='admin'
            )
            db.session.add(admin)
        else:
            print("Admin user already exists. Updating password...")
            admin.password_hash = generate_password_hash('admin123')
            admin.is_verified = True
            admin.is_approved = True
            admin.role = 'admin'
        
        db.session.commit()
        print("Setup complete. You can now login with admin / admin123")

if __name__ == "__main__":
    setup()
