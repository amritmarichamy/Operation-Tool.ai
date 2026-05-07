document.addEventListener('DOMContentLoaded', () => {
    const authWrapper = document.querySelector('.auth-wrapper');
    const loginTrigger = document.querySelector('.register-trigger');
    const registerTrigger = document.querySelector('.login-trigger');
    const otpOverlay = document.getElementById('otpOverlay');
    const toast = document.getElementById('toast');

    let currentUserId = null;

    // Toggle Panels
    loginTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        authWrapper.classList.add('toggled');
    });

    registerTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        authWrapper.classList.remove('toggled');
    });

    // Helper: Toast Notification
    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.style.background = isError ? '#ff4757' : '#2ed573';
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    // Register Logic
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('regUsername').value;
        const email = document.getElementById('regEmail').value;
        const password = document.getElementById('regPassword').value;

        try {
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password })
            });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message);
                if (data.requires_verification) {
                    currentUserId = data.user_id;
                    otpOverlay.style.display = 'flex';
                    // Clear and focus OTP
                    document.querySelectorAll('.otp-input-group input').forEach(i => i.value = '');
                    document.querySelector('.otp-input-group input').focus();
                } else {
                    authWrapper.classList.remove('toggled');
                }
            } else {
                showToast(data.error, true);
            }
        } catch (err) {
            showToast('Registration failed. Server error.', true);
        }
    });

    // Login Logic (Triggers OTP)
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value;
        const password = document.getElementById('loginPassword').value;

        try {
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (res.ok) {
                currentUserId = data.user_id;
                otpOverlay.style.display = 'flex';
                showToast(data.message);
                // Clear OTP inputs
                document.querySelectorAll('.otp-input-group input').forEach(i => i.value = '');
                document.querySelector('.otp-input-group input').focus();
            } else {
                if (data.requires_verification) {
                    currentUserId = data.user_id;
                    otpOverlay.style.display = 'flex';
                    document.querySelectorAll('.otp-input-group input').forEach(i => i.value = '');
                    document.querySelector('.otp-input-group input').focus();
                }
                showToast(data.error, true);
            }
        } catch (err) {
            showToast('Login failed. Server error.', true);
        }
    });

    // OTP Verification Logic
    document.getElementById('verifyOtpBtn').addEventListener('click', async () => {
        const otpInputs = document.querySelectorAll('.otp-input-group input');
        let otp = '';
        otpInputs.forEach(input => otp += input.value);

        if (otp.length < 6) {
            showToast('Please enter the full 6-digit OTP', true);
            return;
        }

        try {
            const res = await fetch('/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: currentUserId, otp })
            });
            const data = await res.json();
            if (res.ok) {
                if (data.redirect) {
                    showToast('Welcome! Redirecting...');
                    setTimeout(() => { window.location.href = data.redirect; }, 1000);
                } else {
                    // Success but no redirect (e.g. pending approval)
                    showToast(data.message);
                    otpOverlay.style.display = 'none';
                    authWrapper.classList.remove('toggled'); // Go back to login tab
                }
            } else {
                showToast(data.error, true);
            }
        } catch (err) {
            showToast('Verification failed. Server error.', true);
        }
    });

    // OTP Input Flow (Auto-focus next/prev)
    const otpInputs = document.querySelectorAll('.otp-input-group input');
    otpInputs.forEach((input, index) => {
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                otpInputs[index - 1].focus();
            }
        });
        input.addEventListener('input', () => {
            if (input.value && index < 5) {
                otpInputs[index + 1].focus();
            }
        });
    });
});
