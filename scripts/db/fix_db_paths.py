import sqlite3
import os

def fix_paths():
    db_path = os.path.join("data", "crm.sqlite3")
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Get some examples first
    cursor.execute("SELECT id, resume_path, cover_letter_path FROM candidates WHERE resume_path IS NOT NULL OR cover_letter_path IS NOT NULL LIMIT 5")
    rows = cursor.fetchall()
    print("Found example paths:")
    for row in rows:
        print(f"ID: {row[0]}, Resume: {row[1]}, Cover: {row[2]}")

    # The pattern to look for is anything ending in \uploads\candidate_...
    # We want to transform it to data/uploads/candidate_...
    
    # We'll use a more robust approach: find the "uploads" part and replace everything before it with "data"
    
    cursor.execute("SELECT id, resume_path, cover_letter_path FROM candidates")
    all_rows = cursor.fetchall()
    
    updated_count = 0
    for id, resume, cover in all_rows:
        new_resume = resume
        new_cover = cover
        
        if resume and "uploads" in resume:
            parts = resume.split("uploads")
            new_resume = "data/uploads" + parts[-1].replace("\\", "/")
            
        if cover and "uploads" in cover:
            parts = cover.split("uploads")
            new_cover = "data/uploads" + parts[-1].replace("\\", "/")
            
        if new_resume != resume or new_cover != cover:
            cursor.execute("UPDATE candidates SET resume_path = ?, cover_letter_path = ? WHERE id = ?", (new_resume, new_cover, id))
            updated_count += 1

    conn.commit()
    print(f"Updated {updated_count} candidates with new paths.")
    
    # Check if files actually exist now
    cursor.execute("SELECT id, resume_path FROM candidates WHERE resume_path IS NOT NULL LIMIT 5")
    for id, path in cursor.fetchall():
        exists = os.path.exists(path)
        print(f"ID {id}: {path} -> Exists: {exists}")
        
    conn.close()

if __name__ == "__main__":
    fix_paths()
