"""
DESTRUCTIVE — permanently deletes candidate rows. Back up crm.sqlite3 first (and commit to git if you use it).

Delete candidates whose updated_at is before KEEP_UPDATED_SINCE (UTC naive, same as DB).

Default KEEP_UPDATED_SINCE = 2026-03-17

Stop the Flask server before running to avoid SQLite locks.

Usage:
  python tools/prune_candidates_keep_recent.py
  python tools/prune_candidates_keep_recent.py 2026-03-24
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DB = ROOT / "crm.sqlite3"
UPLOAD_ROOT = ROOT / "uploads"

DEFAULT_CUTOFF = "2026-03-17 00:00:00"


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument(
        "cutoff",
        nargs="?",
        default=DEFAULT_CUTOFF,
        help=f"Keep candidates with updated_at >= this (ISO or 'YYYY-MM-DD'). Default: {DEFAULT_CUTOFF}",
    )
    p.add_argument("--yes", action="store_true", help="Required to actually delete.")
    args = p.parse_args()
    cutoff = (args.cutoff or DEFAULT_CUTOFF).strip()
    if len(cutoff) == 10:
        cutoff = cutoff + " 00:00:00"

    if not DB.is_file():
        print("Database not found:", DB)
        sys.exit(1)

    con = sqlite3.connect(DB)
    cur = con.cursor()
    cur.execute("SELECT COUNT(*) FROM candidates")
    total = cur.fetchone()[0]
    cur.execute(
        "SELECT COUNT(*) FROM candidates WHERE updated_at < ? OR updated_at IS NULL",
        (cutoff,),
    )
    n_drop = cur.fetchone()[0]
    cur.execute(
        "SELECT COUNT(*) FROM candidates WHERE updated_at >= ?",
        (cutoff,),
    )
    n_keep = cur.fetchone()[0]
    print(f"Total candidates: {total}")
    print(f"Keep (updated_at >= {cutoff}): {n_keep}")
    print(f"Delete (updated_at < {cutoff} or NULL): {n_drop}")

    cur.execute(
        "SELECT id, name, email, updated_at FROM candidates WHERE updated_at < ? OR updated_at IS NULL ORDER BY id LIMIT 5",
        (cutoff,),
    )
    sample = cur.fetchall()
    if sample:
        print("Sample rows to delete (first 5):")
        for row in sample:
            print(" ", row)

    if not args.yes:
        print("\nDry run only. Re-run with --yes to delete.")
        con.close()
        return

    cur.execute(
        "SELECT id FROM candidates WHERE updated_at < ? OR updated_at IS NULL",
        (cutoff,),
    )
    ids = [r[0] for r in cur.fetchall()]
    if not ids:
        print("Nothing to delete.")
        con.close()
        return

    def qmany(sql: str) -> None:
        cur.execute(sql)

    id_list = ",".join(str(i) for i in ids)

    try:
        con.execute("PRAGMA foreign_keys = OFF")
        qmany(f"DELETE FROM email_events WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM job_applications WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM sent_history WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM workspaces WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM workflow_plans WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM run_candidate_reports WHERE candidate_id IN ({id_list})")
        qmany(f"DELETE FROM candidates WHERE id IN ({id_list})")
        con.commit()
        print(f"Deleted {len(ids)} candidates and dependent rows.")
    except Exception as ex:
        con.rollback()
        print("Error:", ex)
        sys.exit(1)
    finally:
        con.execute("PRAGMA foreign_keys = ON")
        con.close()

    if UPLOAD_ROOT.is_dir():
        removed = 0
        for cid in ids:
            folder = UPLOAD_ROOT / f"candidate_{cid}"
            if folder.is_dir():
                shutil.rmtree(folder, ignore_errors=True)
                removed += 1
        print(f"Removed {removed} upload folder(s) under uploads/candidate_*.")


if __name__ == "__main__":
    main()
