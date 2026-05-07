BUCKLIST_BUCKET_KEYS = ("0-30", "31-60", "61-90", "91-120", "121-150", "151-180", ">180")

ENROLLMENT_STATUSES = frozenset({"Ongoing", "On Hold", "Completed"})

BUCKLIST_CATEGORY_BOUNDS = {
    "0-30": (0, 30),
    "31-60": (31, 60),
    "61-90": (61, 90),
    "91-120": (91, 120),
    "121-150": (121, 150),
    "151-180": (151, 180),
    ">180": (181, 999999),
}

# Background scheduler only — bands 91+ keep automated sends; 0–90 days defer (no send, schedule bumped).
SCHEDULER_AUTOMATION_DISABLED_BUCKLIST_BUCKETS = frozenset({"0-30", "31-60", "61-90"})
