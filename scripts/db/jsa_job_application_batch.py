# kind.py (jsa_job_application_batch.py)
# -----------------------------------------------------------
# Batch add Job Application rows from Excel/CSV.
# Required columns:
#   enrollment_id, country, company_name, job_role, screenshot_path, applied_date
# - enrollment_id can be a number or a full URL (…update?id=632)
# - applied_date accepts common formats; normalized to YYYY-MM-DD
#
# TEAM & LOGIN FLOW:
# 1. Start: Run 'python tools/jsa_job_application_batch.py' in your terminal.
# 2. Login: Type your credentials into the TERMINAL when prompted.
# 3. OTP: If the browser shows an OTP screen, read the code from your email 
#    and type it into the TERMINAL (do NOT type it into the browser).
# 4. Session: The script saves 'cookies.pkl' to skip login on next run.
#
# SETUP: Requires Python 3.10+ and 'pip install -r requirements.txt'
# -----------------------------------------------------------

import os
import re
import time
import pickle
from pathlib import Path
from datetime import datetime

import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

BASE_URL = "https://backend.terratern.com"
COOKIES_FILE = "cookies.pkl"


# ===================== Selenium Setup ===================== #
def start_driver(headless: bool = False):
    """Start a Chrome WebDriver with optional headless mode."""
    opts = webdriver.ChromeOptions()
    if headless:
        opts.add_argument("--headless=new")
        opts.add_argument("--disable-gpu")
        opts.add_argument("--no-sandbox")
    opts.add_argument("--start-maximized")

    # Reduce "automation" fingerprint (best effort)
    opts.add_argument("--disable-blink-features=AutomationControlled")
    opts.add_experimental_option("excludeSwitches", ["enable-automation"])
    opts.add_experimental_option("useAutomationExtension", False)

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=opts)

    # Hide webdriver flag in JS (best effort)
    try:
        driver.execute_cdp_cmd(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": "Object.defineProperty(navigator, 'webdriver', {get: () => undefined});"},
        )
    except Exception:
        pass

    return driver


# ===================== Cookie Helpers ===================== #
def save_cookies(driver, path: str = COOKIES_FILE):
    try:
        cookies = driver.get_cookies()
        with open(path, "wb") as f:
            pickle.dump(cookies, f)
        print(f"🔐 Session saved to {path}")
    except Exception as e:
        print(f"⚠️ Could not save cookies: {e}")


def load_cookies(driver, path: str = COOKIES_FILE) -> bool:
    try:
        if not os.path.exists(path):
            return False
        driver.get(BASE_URL)  # must be on domain to add cookies
        with open(path, "rb") as f:
            cookies = pickle.load(f)
        for c in cookies:
            if isinstance(c.get("expiry"), float):
                c["expiry"] = int(c["expiry"])
            try:
                driver.add_cookie(c)
            except Exception:
                pass
        print(f"🔓 Loaded session from {path}")
        return True
    except Exception as e:
        print(f"⚠️ Could not load cookies: {e}")
        return False


# ===================== Login Detection (UPDATED) ===================== #
def _any_visible(driver, xpath: str) -> bool:
    try:
        els = driver.find_elements(By.XPATH, xpath)
        for el in els:
            try:
                if el.is_displayed() and el.is_enabled():
                    return True
            except Exception:
                continue
        return False
    except Exception:
        return False


def save_debug_state(driver, name: str):
    """Save screenshot and HTML for debugging."""
    try:
        driver.save_screenshot(f"{name}.png")
        with open(f"{name}.html", "w", encoding="utf-8") as f:
            f.write(driver.page_source or "")
        print(f"🧾 Saved debug files: {name}.png, {name}.html")
    except Exception as e:
        print(f"⚠️ Could not save debug files: {e}")


def is_login_page(driver) -> bool:
    """
    True only if login/auth controls are VISIBLE.
    Prevents false failures when dashboard search fields match email/text inputs.
    """
    try:
        # If 'Logout' is visible, we are logged in, NOT on login page.
        if _any_visible(driver, "//a[contains(@href,'logout')]") or \
           _any_visible(driver, "//*[contains(text(),'Logout')]"):
            return False

        # Visible password input is the strongest signal for login/registration/auth
        if _any_visible(driver, "//input[@type='password']"):
            return True

        # Visible OTP controls (multi-box or single)
        # Search specifically for elements that look like OTP inputs
        if _any_visible(
            driver,
            "//input[contains(@name,'otp') or contains(@id,'otp') or @inputmode='numeric' or @type='tel' or contains(@class,'otp')]",
        ):
            html = (driver.page_source or "").lower()
            # Only count as auth flow if 'otp' or 'verify' is near the input
            if any(k in html for k in ["otp", "verification", "code", "verify code"]):
                return True

        # Specific ID from Pipeline login page
        if _any_visible(driver, "//*[@id='loginUsername']"):
            return True

        # URL check as fallback
        curr = driver.current_url.lower()
        if "/login" in curr or "/otp" in curr:
             # Even then, we check for inputs
             if _any_visible(driver, "//input"):
                 return True

        return False
    except Exception:
        return False


def is_logged_in(driver) -> bool:
    """True if we see 'Logout' or a clear signal of an active session."""
    try:
        # 'Logout' link or button is the universal signal for this app
        if _any_visible(driver, "//a[contains(@href,'logout')]") or \
           _any_visible(driver, "//*[contains(text(),'Logout')]") or \
           _any_visible(driver, "//a[contains(@href,'profile')]"):
            return True
            
        # If we can hit index and stay there (no 'login' in URL)
        # (Though is_logged_in is usually called when already on index)
        curr = driver.current_url.lower()
        if "/jsa-enrollment" in curr and "login" not in curr:
            return True

        return False
    except Exception:
        return False


# ===================== OTP Helpers ===================== #
def _fill_otp(driver, otp: str):
    otp = re.sub(r"\D", "", otp or "")
    if not otp:
        raise ValueError("OTP is empty/invalid.")

    # Multi-box OTP inputs (common 4/6/8 digits)
    # Search for numeric/tel inputs that are visible and likely part of a group
    otp_boxes = driver.find_elements(By.XPATH, "//input[@inputmode='numeric' or @type='tel' or contains(@class,'otp')]")
    otp_boxes = [b for b in otp_boxes if b.is_displayed() and b.is_enabled()]

    # If we found multiple boxes and they match or exceed the OTP length
    if len(otp_boxes) >= len(otp) and len(otp_boxes) > 1:
        for i, box in enumerate(otp_boxes[: len(otp)]):
            try:
                box.click() # Ensure focus
                box.clear()
            except Exception:
                pass
            box.send_keys(otp[i])
        return

    # Single OTP input fallback
    otp_input = WebDriverWait(driver, 10).until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                "//input[contains(@name,'otp') or contains(@id,'otp') or @type='tel' or @inputmode='numeric']",
            )
        )
    )
    try:
        otp_input.clear()
    except Exception:
        pass
    otp_input.send_keys(otp)


def _click_submit_like(driver) -> bool:
    """Try click common submit/verify buttons. Return True if clicked."""
    candidates = [
        "//*[@id='verifyOtpBtn']", # Specific to Pipeline
        "//button[@type='submit']",
        "//input[@type='submit']",
        "//button[contains(translate(.,'VERIFYCONTINUESUBMIT','verifycontinuesubmit'),'verify')]",
        "//button[contains(translate(.,'VERIFYCONTINUESUBMIT','verifycontinuesubmit'),'continue')]",
        "//button[contains(translate(.,'VERIFYCONTINUESUBMIT','verifycontinuesubmit'),'submit')]",
        "//button[contains(translate(.,'SIGNINLOGIN','signinlogin'),'login')]",
        "//button[contains(translate(.,'SIGNINLOGIN','signinlogin'),'sign in')]",
        "//button[normalize-space()='Verify & Login']",
    ]
    for xp in candidates:
        try:
            # Short wait to avoid blocking if element is not there
            btn = WebDriverWait(driver, 1.5).until(EC.element_to_be_clickable((By.XPATH, xp)))
            btn.click()
            return True
        except Exception:
            continue
    return False


# ===================== Login (UPDATED) ===================== #
def interactive_login_with_otp(driver):
    wait = WebDriverWait(driver, 40)

    # Start from protected page
    driver.get(f"{BASE_URL}/jsa-enrollment/index")
    time.sleep(1.0)

    # Already logged in?
    if not is_login_page(driver) and is_logged_in(driver):
        return

    # Username + password fields
    user = wait.until(
        EC.presence_of_element_located(
            (By.XPATH, "//input[(@type='text' or @type='email' or @id='loginUsername') and not(@disabled)]")
        )
    )
    pwd = wait.until(EC.presence_of_element_located((By.XPATH, "//input[@type='password']")))

    username = input("Username (email/username): ").strip()
    password = input("Password: ").strip()

    try:
        user.clear()
    except Exception:
        pass
    user.send_keys(username)

    try:
        pwd.clear()
    except Exception:
        pass
    pwd.send_keys(password)

    # Submit login
    if not _click_submit_like(driver):
        pwd.send_keys(Keys.ENTER)

    time.sleep(1.5)

    # OTP may appear
    otp_needed = False
    try:
        # Check for OTP container, input, or URL change
        WebDriverWait(driver, 12).until(
            EC.any_of(
                EC.visibility_of_element_located((By.ID, "otpOverlay")),
                EC.presence_of_element_located(
                    (
                        By.XPATH,
                        "//input[contains(@name,'otp') or contains(@id,'otp') or @type='tel' or @inputmode='numeric']",
                    )
                ),
                EC.url_contains("otp"),
            )
        )
        otp_needed = True
    except Exception:
        otp_needed = False

    if otp_needed:
        otp = input("\n📲 Enter the OTP shown on the site…\nOTP: ").strip()
        _fill_otp(driver, otp)
        if not _click_submit_like(driver):
            try:
                driver.find_element(By.TAG_NAME, "body").send_keys(Keys.ENTER)
            except Exception:
                pass
        
        # Wait for redirect/session state
        time.sleep(4.0)
        try:
            WebDriverWait(driver, 10).until(lambda d: is_logged_in(d))
        except Exception:
            pass

    # Final check: prioritize is_logged_in over is_login_page
    if not is_logged_in(driver):
        save_debug_state(driver, "login_failed")
        # Detailed failure message
        is_still_login = is_login_page(driver)
        msg = "Login failed."
        if is_still_login:
             msg += " Still in login/OTP flow. Check OTP validity or captcha."
        else:
             msg += " Not on login page but session not active. Check debug files."
        raise RuntimeError(msg)

    print("✅ Login successful.")


# ===================== Parsing/Normalization ===================== #
def parse_enrollment_id(value) -> int:
    """Accept '12', '12.0', or 'https://...id=12'."""
    if pd.isna(value):
        raise ValueError("enrollment_id is empty")
    s = str(value).strip()

    m = re.search(r"[?&]id=(\d+)", s)
    if m:
        return int(m.group(1))

    nums = re.findall(r"\d+", s)
    if len(nums) == 1:
        return int(nums[0])

    try:
        return int(float(s))
    except Exception:
        raise ValueError(f"Could not parse enrollment_id from '{s}'") from None


def normalize_date(val) -> str:
    """Return YYYY-MM-DD from common formats or Excel datetimes."""
    if pd.isna(val):
        raise ValueError("applied_date is empty")

    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")

    s = str(val).strip()
    for fmt in (
        "%Y-%m-%d",
        "%d/%m/%Y",
        "%d-%m-%Y",
        "%d.%m.%Y",
        "%m/%d/%Y",
        "%d %b %Y",
        "%d %B %Y",
    ):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%d")
        except ValueError:
            pass

    return pd.to_datetime(s, dayfirst=True).strftime("%Y-%m-%d")


# ===================== Page Actions ===================== #
def open_job_application_tab(driver, enrollment_id: int):
    url = f"{BASE_URL}/jsa-enrollment/update?id={enrollment_id}&tab=jobApplication"
    driver.get(url)
    WebDriverWait(driver, 25).until(
        EC.presence_of_element_located(
            (
                By.XPATH,
                "//button[@id='create-job' or @id='create_job' or "
                "normalize-space()='Add Job' or normalize-space()='Add Job Details' or "
                "contains(.,'Add Job')]",
            )
        )
    )


def click_add_job(driver):
    try:
        btn = WebDriverWait(driver, 12).until(
            EC.element_to_be_clickable((By.XPATH, "//*[@id='create-job' or @id='create_job']"))
        )
        btn.click()
        return
    except Exception:
        pass

    btn = WebDriverWait(driver, 12).until(
        EC.element_to_be_clickable(
            (
                By.XPATH,
                "//button[normalize-space()='Add Job' or "
                "normalize-space()='Add Job Details' or "
                "normalize-space()='Job Application' or contains(.,'Add Job')]",
            )
        )
    )
    btn.click()


def _type_into_labeled_input(driver, label_text: str, value: str):
    xp = (
        "//div[contains(@class,'modal') and contains(@class,'show')]"
        f"//label[normalize-space()='{label_text}']/following::input[1]"
    )
    el = WebDriverWait(driver, 12).until(EC.presence_of_element_located((By.XPATH, xp)))
    try:
        el.clear()
    except Exception:
        pass
    el.send_keys(value)


def _upload_file_in_modal(driver, file_path: str):
    xp = "//div[contains(@class,'modal') and contains(@class,'show')]//input[@type='file']"
    file_inp = WebDriverWait(driver, 12).until(EC.presence_of_element_located((By.XPATH, xp)))
    file_inp.send_keys(file_path)


def _set_date_in_modal(driver, label_text: str, date_str: str):
    xp = (
        "//div[contains(@class,'modal') and contains(@class,'show')]"
        f"//label[normalize-space()='{label_text}']/following::input[1]"
    )
    inp = WebDriverWait(driver, 12).until(EC.presence_of_element_located((By.XPATH, xp)))

    try:
        inp.clear()
        inp.send_keys(date_str)
    except Exception:
        pass

    driver.execute_script("arguments[0].value = arguments[1];", inp, date_str)
    driver.execute_script("arguments[0].dispatchEvent(new Event('input', {bubbles:true}));", inp)
    driver.execute_script("arguments[0].dispatchEvent(new Event('change',{bubbles:true}));", inp)
    driver.execute_script("arguments[0].dispatchEvent(new Event('blur', {bubbles:true}));", inp)


# ---------- COUNTRY: ultra-robust setter + verification ---------- #
def _sleep_ms(ms: int = 150):
    time.sleep(ms / 1000.0)


def _read_country_value_js(driver) -> str:
    return (
        driver.execute_script(
            """
        const modal = document.querySelector('div.modal.show');
        if (!modal) return '';

        let el = modal.querySelector('input[name*="country" i], select[name*="country" i]');
        if (el) {
          if (el.tagName === 'SELECT') {
            const opt = el.options[el.selectedIndex];
            return (opt && (opt.text || opt.value)) || el.value || '';
          }
          return el.value || '';
        }

        const s2 = modal.querySelector('.select2-container, [class*="select2"]');
        if (s2) {
          const txt = s2.querySelector('.select2-selection__rendered');
          if (txt && txt.textContent) return txt.textContent.trim();
        }
        return '';
        """
        )
        or ""
    )


def _try_label_input(driver, value: str) -> bool:
    try:
        modal = WebDriverWait(driver, 6).until(
            EC.visibility_of_element_located((By.XPATH, "//div[contains(@class,'modal') and contains(@class,'show')]"))
        )
        inp = modal.find_element(By.XPATH, ".//label[normalize-space()='Country']/following::input[1]")
        try:
            inp.clear()
        except Exception:
            pass
        inp.send_keys(value)
        inp.send_keys(Keys.TAB)
        driver.execute_script("arguments[0].dispatchEvent(new Event('change',{bubbles:true}));", inp)
        driver.execute_script("arguments[0].dispatchEvent(new Event('blur',{bubbles:true}));", inp)
        return True
    except Exception:
        return False


def _try_label_select(driver, value: str) -> bool:
    try:
        modal = WebDriverWait(driver, 6).until(
            EC.visibility_of_element_located((By.XPATH, "//div[contains(@class,'modal') and contains(@class,'show')]"))
        )
        sel = modal.find_element(By.XPATH, ".//label[normalize-space()='Country']/following::select[1]")
        driver.execute_script(
            """
        const sel = arguments[0], val = arguments[1];
        const optExact = [...sel.options].find(o => (o.text||'').trim() === val);
        const optLike = optExact || [...sel.options].find(o => (o.text||'').toLowerCase().includes(val.toLowerCase()));
        if (optLike) {
          sel.value = optLike.value;
          sel.dispatchEvent(new Event('change', {bubbles:true}));
          sel.dispatchEvent(new Event('blur', {bubbles:true}));
        }
        """,
            sel,
            value,
        )
        sel.send_keys(Keys.TAB)
        return True
    except Exception:
        return False


def _try_generic_country_input(driver, value: str) -> bool:
    try:
        modal = WebDriverWait(driver, 6).until(
            EC.visibility_of_element_located((By.XPATH, "//div[contains(@class,'modal') and contains(@class,'show')]"))
        )
        inp2 = modal.find_element(
            By.XPATH,
            ".//input[contains(translate(@placeholder,'COUNTRY','country'),'country') or "
            "contains(translate(@name,'COUNTRY','country'),'country')]",
        )
        try:
            inp2.clear()
        except Exception:
            pass
        inp2.send_keys(value)
        inp2.send_keys(Keys.TAB)
        driver.execute_script("arguments[0].dispatchEvent(new Event('change',{bubbles:true}));", inp2)
        driver.execute_script("arguments[0].dispatchEvent(new Event('blur',{bubbles:true}));", inp2)
        return True
    except Exception:
        return False


def _try_select2(driver, value: str) -> bool:
    try:
        el = WebDriverWait(driver, 6).until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    "//div[contains(@class,'modal') and contains(@class,'show')]"
                    "//label[normalize-space()='Country']/following::*[contains(@class,'select2-selection')][1]",
                )
            )
        )
        el.click()
        _sleep_ms(120)

        try:
            search = WebDriverWait(driver, 2).until(
                EC.presence_of_element_located((By.XPATH, "//input[contains(@class,'select2-search__field')]"))
            )
            search.clear()
            search.send_keys(value)
            _sleep_ms(200)
        except Exception:
            pass

        opt = WebDriverWait(driver, 4).until(
            EC.element_to_be_clickable(
                (
                    By.XPATH,
                    f"//li[contains(@class,'select2-results__option')]"
                    f"[contains(translate(., '{value.upper()}','{value.lower()}'),'{value.lower()}')]",
                )
            )
        )
        opt.click()
        _sleep_ms(120)
        return True
    except Exception:
        return False


def _js_force_set(driver, value: str) -> bool:
    try:
        driver.execute_script(
            """
        const modal = document.querySelector('div.modal.show');
        if (!modal) return;

        const els = modal.querySelectorAll('input[name*="country" i], select[name*="country" i]');
        els.forEach(el => {
          if (el.tagName === 'SELECT') {
            const optExact = [...el.options].find(o => (o.text||'').trim() === arguments[0]);
            const optLike = optExact || [...el.options].find(o => (o.text||'').toLowerCase().includes(arguments[0].toLowerCase()));
            if (optLike) el.value = optLike.value;
          } else {
            el.value = arguments[0];
          }
          el.dispatchEvent(new Event('input', {bubbles:true}));
          el.dispatchEvent(new Event('change', {bubbles:true}));
          el.dispatchEvent(new Event('blur', {bubbles:true}));
        });
        """,
            value,
        )
        _sleep_ms(80)
        return True
    except Exception:
        return False


def set_country_with_retries(driver, desired: str = "Germany", max_tries: int = 5):
    for attempt in range(1, max_tries + 1):
        ok = (
            _try_label_input(driver, desired)
            or _try_label_select(driver, desired)
            or _try_select2(driver, desired)
            or _try_generic_country_input(driver, desired)
            or _js_force_set(driver, desired)
        )
        _sleep_ms(180)

        current = (_read_country_value_js(driver) or "").strip().lower()
        if desired.lower() in current:
            if attempt > 1:
                print(f"✓ Country set after {attempt} tries")
            return

        if not ok:
            _sleep_ms(220)

    raise RuntimeError(f"Country could not be set to '{desired}' after multiple attempts.")


# ================================================================= #
def add_one_job(driver, country: str, company: str, role: str, screenshot: str, applied_date: str):
    WebDriverWait(driver, 18).until(
        EC.visibility_of_element_located((By.XPATH, "//div[contains(@class,'modal') and contains(@class,'show')]"))
    )

    _sleep_ms(220)

    target_country = (country or "Germany").strip() or "Germany"
    set_country_with_retries(driver, target_country, max_tries=5)

    _type_into_labeled_input(driver, "Company Name", company)
    _type_into_labeled_input(driver, "Job Role", role)

    if not (screenshot and os.path.isfile(screenshot)):
        raise FileNotFoundError(f"Screenshot not found: {screenshot}")
    _upload_file_in_modal(driver, screenshot)

    _set_date_in_modal(driver, "Applied Date", applied_date)

    xp_save = (
        "//div[contains(@class,'modal') and contains(@class,'show')]"
        "//button[normalize-space()='Save' or @id='save' or contains(@class,'btn-primary')]"
    )
    btn = WebDriverWait(driver, 12).until(EC.element_to_be_clickable((By.XPATH, xp_save)))
    btn.click()

    WebDriverWait(driver, 25).until(
        EC.invisibility_of_element_located((By.XPATH, "//div[contains(@class,'modal') and contains(@class,'show')]"))
    )
    _sleep_ms(220)


# ===================== Path Sanitizer + IO ===================== #
def _sanitize_path(s: str) -> str:
    if s is None:
        return ""
    s = re.sub(r"[\u200e\u200f\u202a-\u202e]", "", s)
    s = s.strip().strip('"').strip("'")
    s = os.path.expandvars(s)
    s = os.path.expanduser(s)
    return s


def load_table(path_str: str):
    cleaned = _sanitize_path(path_str)
    p = Path(cleaned)
    try:
        p = p.resolve(strict=False)
    except Exception:
        pass

    if not p.exists():
        raise FileNotFoundError(f"Input file not found:\n raw: {path_str}\n cleaned: {p}")

    if p.suffix.lower() in (".xlsx", ".xls"):
        try:
            return pd.read_excel(p), p
        except Exception as e:
            raise RuntimeError(f"Failed to read Excel '{p}': {e}") from None

    if p.suffix.lower() == ".csv":
        try:
            return pd.read_csv(p), p
        except Exception as e:
            raise RuntimeError(f"Failed to read CSV '{p}': {e}") from None

    raise ValueError(f"Unsupported file type: {p.suffix} (use .xlsx/.xls or .csv)")


# ===================== Main ===================== #
def main():
    print("Path to Excel/CSV template with job rows:")
    input_path = _sanitize_path(input("> "))
    df, ipath = load_table(input_path)

    required = ["enrollment_id", "country", "company_name", "job_role", "screenshot_path", "applied_date"]
    for col in required:
        if col not in df.columns:
            raise ValueError(f"Missing required column: {col}")

    driver = start_driver(headless=False)
    results = []

    try:
        _ = load_cookies(driver, COOKIES_FILE)

        # Login check: if not logged in, do interactive login once
        driver.get(f"{BASE_URL}/jsa-enrollment/index")
        time.sleep(1.0)
        if not is_logged_in(driver):
            print("🔑 Session not active — logging in once...")
            interactive_login_with_otp(driver)
            if is_logged_in(driver):
                save_cookies(driver, COOKIES_FILE)

        # Process rows
        for idx, row in df.iterrows():
            ridx = idx + 1
            try:
                enrollment_id = parse_enrollment_id(row["enrollment_id"])
                country = (str(row["country"]).strip() if pd.notna(row["country"]) else "") or "Germany"
                company = str(row["company_name"]).strip()
                role = str(row["job_role"]).strip()
                screenshot = _sanitize_path(str(row["screenshot_path"]).strip())
                applied_date = normalize_date(row["applied_date"])

                open_job_application_tab(driver, enrollment_id)
                click_add_job(driver)
                add_one_job(driver, country, company, role, screenshot, applied_date)

                results.append({"row": ridx, "enrollment_id": enrollment_id, "status": "OK", "message": ""})
                print(f"[{ridx}] ✅ enrollment {enrollment_id}: submitted.")

            except Exception as e:
                results.append(
                    {"row": ridx, "enrollment_id": row.get("enrollment_id", ""), "status": "ERROR", "message": str(e)}
                )
                print(f"[{ridx}] ❌ ERROR: {e}")
                continue
            finally:
                time.sleep(1.5)

    finally:
        driver.quit()

    out_csv = ipath.with_name(ipath.stem + "__results.csv")
    pd.DataFrame(results).to_csv(out_csv, index=False)
    print(f"\n📄 Report saved to: {out_csv}")
    print("Done.")


if __name__ == "__main__":
    main()
