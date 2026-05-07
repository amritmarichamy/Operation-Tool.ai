import re
import socket
from typing import Tuple

EMAIL_RE = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@"
    r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)

DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "10minutemail.com", "tempmail.com",
    "yopmail.com", "trashmail.com", "sharklasers.com"
}

def looks_like_email(addr: str) -> bool:
    if not addr or "@" not in addr:
        return False
    return bool(EMAIL_RE.match(addr.strip()))

def has_mx_records(domain: str, enable_check=False) -> bool:
    if not enable_check:
        return True
    try:
        import dns.resolver
        answers = dns.resolver.resolve(domain, "MX")
        return any(answers)
    except Exception:
        return False

def domain_is_allowed(domain: str) -> bool:
    return domain.lower() not in DISPOSABLE_DOMAINS

def is_valid_address_for_send(addr: str, enable_mx_check=False) -> Tuple[bool, str]:
    addr = (addr or "").strip().lower()
    if not looks_like_email(addr):
        return (False, "invalid_syntax")
    try:
        _, domain = addr.split("@", 1)
    except ValueError:
        return (False, "invalid_syntax")
    if not domain_is_allowed(domain):
        return (False, "disposable_domain")
    if not has_mx_records(domain, enable_mx_check):
        return (False, "no_mx")
    return (True, "")
