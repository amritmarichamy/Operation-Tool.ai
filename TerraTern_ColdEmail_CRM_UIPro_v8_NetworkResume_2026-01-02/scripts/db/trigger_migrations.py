from server import app, db, migrate_sqlite, User
import os

def run_migrations():
    print("Starting app context to trigger migrations...")
    with app.app_context():
        # 1. Standard tables
        db.create_all()
        
        # 2. Manual migrations for SQLite (ALTER TABLE)
        import sqlite3
        conn = sqlite3.connect(CRM_SQLITE_PATH)
        cursor = conn.cursor()
        
        # Add allowed_features to users if missing
        cursor.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in cursor.fetchall()]
        if 'allowed_features' not in cols:
            print("Adding 'allowed_features' column to 'users' table...")
            cursor.execute("ALTER TABLE users ADD COLUMN allowed_features TEXT")
        
        conn.commit()
        conn.close()
        
        print("\nVerifying Database Schema...")
        from sqlalchemy import inspect
        inspector = inspect(db.engine)
        
        # Check users
        user_cols = [c['name'] for c in inspector.get_columns('users')]
        print(f"Columns in 'users': {user_cols}")
        needed = ['is_verified', 'is_approved', 'role', 'allowed_features']
        missing = [c for c in needed if c not in user_cols]
        if not missing:
            print("SUCCESS: All 'users' columns exist.")
        else:
            print(f"FAILURE: Missing columns in 'users': {missing}")

        # Check pending_changes table
        tables = inspector.get_table_names()
        if 'pending_changes' in tables:
            print("SUCCESS: 'pending_changes' table exists.")
        else:
            print("FAILURE: 'pending_changes' table is missing.")

        # Check admin
        admin = User.query.filter_by(role='admin').first()
        if admin:
            print(f"Admin found: {admin.username} (Approved: {admin.is_approved}, Role: {admin.role})")
        else:
            print("No admin found.")

if __name__ == "__main__":
    from server import CRM_SQLITE_PATH
    run_migrations()
