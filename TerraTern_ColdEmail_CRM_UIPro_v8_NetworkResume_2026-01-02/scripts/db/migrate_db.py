import sqlite3
import os

BASE_DIR = r"c:\Users\Dell\Desktop\Project\Network Bug Fixed\TerraTern_ColdEmail_CRM_UIPro_v8_NetworkResume_2026-01-02"
db_path = os.path.join(BASE_DIR, "crm.sqlite3")

def migrate():
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    columns_to_add = [
        ("country", "VARCHAR(100)"),
        ("industry", "VARCHAR(150)"),
        ("scheduled_start_time", "DATETIME")
    ]

    for col_name, col_type in columns_to_add:
        try:
            cur.execute(f"ALTER TABLE workflow_plans ADD COLUMN {col_name} {col_type}")
            print(f"Successfully added column {col_name} to workflow_plans.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column {col_name} already exists. Skipping.")
            else:
                print(f"Error adding column {col_name}: {e}")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
