"""
One-off: delete all CRM business data; keep users so you can still log in.

Usage (from project root):
  python tools/wipe_database_keep_users.py --yes

Optional: also remove all user accounts (you must register again):
  python tools/wipe_database_keep_users.py --yes --wipe-users
"""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

# Child tables first; users last (optional).
_TABLES_ORDER = [
    "email_events",
    "job_applications",
    "sent_history",
    "run_candidate_reports",
    "workspaces",
    "workflow_plans",
    "send_runs",
    "targets",
    "candidates",
    "industries",
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--yes", action="store_true", help="Required; confirms wipe.")
    ap.add_argument(
        "--wipe-users",
        action="store_true",
        help="Also delete users (must re-register / restore admin manually).",
    )
    args = ap.parse_args()
    if not args.yes:
        raise SystemExit("Refusing to wipe without --yes")

    root = Path(__file__).resolve().parent.parent
    db_path = root / "crm.sqlite3"
    if not db_path.is_file():
        raise SystemExit(f"Missing database: {db_path}")

    conn = sqlite3.connect(db_path)
    try:
        cur = conn.cursor()
        cur.execute("PRAGMA foreign_keys = OFF")
        existing = {
            r[0]
            for r in cur.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()
        }
        for t in _TABLES_ORDER:
            if t in existing:
                cur.execute(f"DELETE FROM {t}")
                print(f"  cleared {t}: {cur.rowcount} rows")
        if args.wipe_users and "users" in existing:
            cur.execute("DELETE FROM users")
            print(f"  cleared users: {cur.rowcount} rows")
        # Anything else unknown
        for t in sorted(existing):
            if t in _TABLES_ORDER or t == "users":
                continue
            cur.execute(f"DELETE FROM {t}")
            print(f"  cleared {t} (extra): {cur.rowcount} rows")
        conn.commit()
        cur.execute("PRAGMA foreign_keys = ON")
        cur.execute("VACUUM")
        conn.commit()
    finally:
        conn.close()

    print(f"Done. Database: {db_path}")


if __name__ == "__main__":
    main()
