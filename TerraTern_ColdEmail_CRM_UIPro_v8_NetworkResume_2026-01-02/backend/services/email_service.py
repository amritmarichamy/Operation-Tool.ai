import time
import smtplib
import imaplib
import ssl
import email
from email.message import EmailMessage
from email import policy as email_policy
from datetime import datetime, timedelta
import socket
from ..config import Config
from ..utils.validators import is_network_up

def send_with_retries(sender_email, sender_password, msg, run_id, run_states, push_progress, _set_run_status):
    attempt = 0
    network_paused = False
    while attempt <= Config.MAX_RETRIES:
        state = run_states.get(str(run_id), {"stop": False, "pause": False})
        if state.get("stop"):
            return ("failed", "Stopped by user")
        while state.get("pause"):
            time.sleep(0.6)
            state = run_states.get(str(run_id), state)

        while not is_network_up():
            if not network_paused:
                network_paused = True
                _set_run_status(str(run_id), "paused_network")
                push_progress(run_id, "⏸️ Network down. Run paused automatically. Waiting for internet to come back…")

            state = run_states.get(str(run_id), {"stop": False, "pause": False})
            if state.get("stop"):
                return ("failed", "Stopped by user")
            while state.get("pause"):
                time.sleep(0.6)
                state = run_states.get(str(run_id), state)

            time.sleep(Config.NETWORK_WAIT_SECONDS)

        if network_paused:
            network_paused = False
            _set_run_status(str(run_id), "running")
            push_progress(run_id, "▶️ Network restored. Resuming email sending…")

        try:
            with smtplib.SMTP(Config.SMTP_HOST, Config.SMTP_PORT, timeout=60) as server:
                server.starttls(context=ssl.create_default_context())
                server.login(sender_email, sender_password)
                mail_opts = ["SMTPUTF8", "DSN"]
                rcpt_opts = ["NOTIFY=FAILURE,DELAY"]
                refused = server.send_message(
                    msg, mail_options=mail_opts, rcpt_options=rcpt_opts
                )
            if refused:
                return ("bounced", f"SMTP rejected recipients: {refused}")
            
            if not append_gmail_sent_folder(sender_email, sender_password, msg):
                push_progress(
                    run_id,
                    "ℹ️ Email accepted by Gmail SMTP. If it does not appear under Sent, enable IMAP "
                    "for this account (Google settings) and ensure the app password works for IMAP.",
                )
            return ("sent", None)

        except smtplib.SMTPRecipientsRefused as e:
            return ("bounced", f"SMTPRecipientsRefused: {e}")
        except smtplib.SMTPAuthenticationError as e:
            return ("failed", f"SMTPAuthenticationError: {e}")
        except smtplib.SMTPException as e:
            attempt += 1
            if attempt > Config.MAX_RETRIES:
                return ("failed", f"SMTPException: {e}")
            backoff = Config.RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            push_progress(run_id, f"ℹ️ SMTP error; retrying in {backoff}s…")
            time.sleep(backoff)
        except (socket.timeout, socket.gaierror, ConnectionError, ssl.SSLError) as e:
            attempt += 1
            if attempt > Config.MAX_RETRIES:
                if not is_network_up():
                    attempt = 0
                    continue
                return ("failed", f"NetworkError: {e}")
            backoff = Config.RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            push_progress(run_id, f"ℹ️ Network error; retrying in {backoff}s…")
            time.sleep(backoff)
        except Exception as e:
            return ("failed", f"UnexpectedError: {e}")

def append_gmail_sent_folder(sender_email: str, sender_password: str, msg: EmailMessage) -> bool:
    try:
        raw = msg.as_bytes(policy=email_policy.SMTP)
    except Exception:
        try:
            raw = msg.as_bytes()
        except Exception:
            return False
    try:
        imap = imaplib.IMAP4_SSL(Config.IMAP_HOST, timeout=60)
        imap.login(sender_email, sender_password)
        for folder in (
            "[Gmail]/Sent Mail",
            "[Gmail]/Sent",
            "Sent",
        ):
            try:
                typ, _ = imap.append(folder, "\\Seen", None, raw)
                if typ == "OK":
                    imap.logout()
                    return True
            except imaplib.IMAP4.error:
                continue
        try:
            imap.logout()
        except Exception:
            pass
    except Exception:
        pass
    return False

def fetch_bounces_gmail(sender_email, sender_password, since_dt, hr_sent_set):
    bounced_to = set()
    try:
        imap = imaplib.IMAP4_SSL(Config.IMAP_HOST)
        imap.login(sender_email, sender_password)
        imap.select("INBOX")
        since = (since_dt - timedelta(days=1)).strftime("%d-%b-%Y")
        criteria = f'(SINCE "{since}" OR FROM "MAILER-DAEMON" SUBJECT "Undelivered Mail Returned to Sender" SUBJECT "Delivery Status Notification" SUBJECT "failure")'
        typ, data = imap.search(None, criteria)
        if typ != "OK":
            imap.logout()
            return bounced_to

        for num in data[0].split():
            typ, msgdata = imap.fetch(num, "(RFC822)")
            if typ != "OK":
                continue
            msg = email.message_from_bytes(msgdata[0][1])

            failed_candidates = set()
            for h in msg.get_all("X-Failed-Recipients", []):
                for addr in h.split(","):
                    a = addr.strip().lower()
                    if a:
                        failed_candidates.add(a)

            for part in msg.walk():
                ctype = (part.get_content_type() or "").lower()
                if ctype == "message/delivery-status":
                    try:
                        payload = part.get_payload()
                        if isinstance(payload, list):
                            for block in payload:
                                final_rcpt = block.get("Final-Recipient")
                                if final_rcpt and ";" in final_rcpt:
                                    a = final_rcpt.split(";", 1)[1].strip().lower()
                                    if a:
                                        failed_candidates.add(a)
                    except Exception:
                        pass

                if ctype == "text/plain":
                    try:
                        textb = part.get_payload(decode=True) or b""
                    except Exception:
                        textb = b""
                    textt = (textb or b"").decode("utf-8", "ignore")
                    for token in textt.replace("<"," ").replace(">"," ").split():
                        if "@" in token and "." in token and len(token) <= 254:
                            cand = token.strip().strip(",.;:()[]{}<>").lower()
                            if "@" in cand and cand.count("@") == 1:
                                failed_candidates.add(cand)

            for a in failed_candidates:
                if a in hr_sent_set:
                    bounced_to.add(a)

        imap.logout()
    except Exception:
        pass
    return bounced_to
