(function () {
  const API_BASE = (function () {
    try {
      const { protocol, hostname, port, origin } = window.location;
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '4000') {
        return `${protocol}//${hostname}:4000/api`;
      }
      return origin + '/api';
    } catch (e) {
      return 'http://localhost:4000/api';
    }
  })();

  const CUSTOMER_TOKEN_KEY = 'barber_customer_token';
  const BARBER_TOKEN_KEY = 'barber_barber_token';

  const authLinks = document.getElementById('auth-links');
  const authUser = document.getElementById('auth-user');
  const authModal = document.getElementById('auth-modal');
  const authModalClose = document.getElementById('auth-modal-close');
  const authTabLogin = document.getElementById('auth-tab-login');
  const authTabRegister = document.getElementById('auth-tab-register');
  const authShowRegister = document.getElementById('auth-show-register');
  const authShowLogin = document.getElementById('auth-show-login');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const loginMessage = document.getElementById('login-message');
  const registerMessage = document.getElementById('register-message');
  const barberLoginOverlay = document.getElementById('barber-login-overlay');
  const formBarberLogin = document.getElementById('form-barber-login');
  const barberLoginMessage = document.getElementById('barber-login-message');
  const btnSettings = document.getElementById('btn-settings');

  let currentCustomer = null;
  let customerGateActive = false;

  function getCustomerToken() { return localStorage.getItem(CUSTOMER_TOKEN_KEY); }
  function setCustomerToken(t) { if (t) localStorage.setItem(CUSTOMER_TOKEN_KEY, t); else localStorage.removeItem(CUSTOMER_TOKEN_KEY); }
  function getBarberToken() { return localStorage.getItem(BARBER_TOKEN_KEY); }
  function setBarberToken(t) { if (t) localStorage.setItem(BARBER_TOKEN_KEY, t); else localStorage.removeItem(BARBER_TOKEN_KEY); }

  function authHeaders(token) {
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function setSettingsVisible(visible) {
    if (!btnSettings) return;
    if (visible) {
      btnSettings.classList.remove('staff-only');
      btnSettings.setAttribute('aria-hidden', 'false');
    } else {
      btnSettings.classList.add('staff-only');
      btnSettings.setAttribute('aria-hidden', 'true');
    }
  }

  function showAuthModal() {
    authModal.classList.add('open');
    authModal.setAttribute('aria-hidden', 'false');
    authTabLogin.classList.remove('hidden');
    authTabRegister.classList.add('hidden');
  }

  function closeAuthModal() {
    if (customerGateActive) return;
    authModal.classList.remove('open');
    authModal.setAttribute('aria-hidden', 'true');
  }

  function showRegister() {
    authTabLogin.classList.add('hidden');
    authTabRegister.classList.remove('hidden');
    loginMessage.textContent = '';
    registerMessage.textContent = '';
  }

  function showLogin() {
    authTabRegister.classList.add('hidden');
    authTabLogin.classList.remove('hidden');
    registerMessage.textContent = '';
    loginMessage.textContent = '';
  }

  function enterAdminMode() {
    sessionStorage.setItem('barberStaff', '1');
    customerGateActive = false;
    authModal.classList.remove('open');
    authModal.setAttribute('aria-hidden', 'true');
    if (authModalClose) authModalClose.style.display = '';
    setSettingsVisible(false);
    barberLoginMessage.textContent = '';
    barberLoginMessage.className = 'form-message';
    barberLoginOverlay.classList.add('open');
    barberLoginOverlay.setAttribute('aria-hidden', 'false');
  }

  authModalClose.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', function (e) {
    if (e.target === authModal && !customerGateActive) closeAuthModal();
  });
  authShowRegister.addEventListener('click', showRegister);
  authShowLogin.addEventListener('click', showLogin);

  document.getElementById('btn-login').addEventListener('click', function () {
    showLogin();
    showAuthModal();
  });
  document.getElementById('btn-register').addEventListener('click', function () {
    showRegister();
    showAuthModal();
  });
  if (!document.getElementById('btn-admin-mode') && authLinks) {
    const sep = document.createTextNode(' · ');
    const adminBtn = document.createElement('button');
    adminBtn.type = 'button';
    adminBtn.className = 'btn-link';
    adminBtn.id = 'btn-admin-mode';
    adminBtn.textContent = 'Admin';
    authLinks.appendChild(sep);
    authLinks.appendChild(adminBtn);
  }
  if (formBarberLogin && !document.getElementById('btn-barber-back')) {
    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'btn-link';
    backBtn.id = 'btn-barber-back';
    backBtn.textContent = 'Back';
    backBtn.style.marginTop = '0.75rem';
    backBtn.addEventListener('click', function () {
      sessionStorage.removeItem('barberStaff');
      barberLoginOverlay.classList.remove('open');
      barberLoginOverlay.setAttribute('aria-hidden', 'true');
      setSettingsVisible(false);
      customerGateActive = true;
      showLogin();
      showAuthModal();
      if (authModalClose) authModalClose.style.display = 'none';
    });
    formBarberLogin.insertAdjacentElement('afterend', backBtn);
  }

  const authSwitch = authShowLogin && authShowLogin.parentElement ? authShowLogin.parentElement : null;
  if (authSwitch && !document.getElementById('btn-admin-from-modal')) {
    const sep2 = document.createTextNode(' · ');
    const adminFromModal = document.createElement('button');
    adminFromModal.type = 'button';
    adminFromModal.className = 'btn-link';
    adminFromModal.id = 'btn-admin-from-modal';
    adminFromModal.textContent = 'Admin';
    authSwitch.appendChild(sep2);
    authSwitch.appendChild(adminFromModal);
  }

  formLogin.addEventListener('submit', async function (e) {
    e.preventDefault();
    loginMessage.textContent = '';
    loginMessage.className = 'form-message';
    const phone = document.getElementById('login-phone').value.trim().replace(/\s/g, '');
    const pin = document.getElementById('login-pin').value;
    if (!phone || !pin) {
      loginMessage.textContent = 'Phone and PIN required.';
      loginMessage.classList.add('error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        loginMessage.textContent = data.error || 'Login failed.';
        loginMessage.classList.add('error');
        return;
      }
      setCustomerToken(data.token);
      if (typeof window.loadAuthCustomer === 'function') window.loadAuthCustomer();
    } catch (err) {
      loginMessage.textContent = 'Network error.';
      loginMessage.classList.add('error');
    }
  });

  formRegister.addEventListener('submit', async function (e) {
    e.preventDefault();
    registerMessage.textContent = '';
    registerMessage.className = 'form-message';
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim().replace(/\s/g, '');
    const pin = document.getElementById('reg-pin').value;
    if (!name) { registerMessage.textContent = 'Name required.'; registerMessage.classList.add('error'); return; }
    if (!phone) { registerMessage.textContent = 'Phone required.'; registerMessage.classList.add('error'); return; }
    if (!pin || pin.length < 4 || pin.length > 8) { registerMessage.textContent = 'PIN must be 4-8 digits.'; registerMessage.classList.add('error'); return; }
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, pin })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        registerMessage.textContent = data.error || 'Registration failed.';
        registerMessage.classList.add('error');
        return;
      }
      setCustomerToken(data.token);
      if (typeof window.loadAuthCustomer === 'function') window.loadAuthCustomer();
    } catch (err) {
      registerMessage.textContent = 'Network error.';
      registerMessage.classList.add('error');
    }
  });

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function renderCustomerUI(user) {
    currentCustomer = user && user.type === 'customer' ? user : null;
    if (currentCustomer) {
      sessionStorage.removeItem('barberStaff');
      authLinks.classList.add('hidden');
      authUser.classList.remove('hidden');
      authUser.innerHTML = `${escapeHtml(currentCustomer.name)} - <button type="button" class="btn-link" id="btn-customer-logout">Logout</button>`;
      document.getElementById('btn-customer-logout').addEventListener('click', customerLogout);
      if (typeof window.prefillCustomer === 'function') window.prefillCustomer(currentCustomer.name, currentCustomer.phone);
      customerGateActive = false;
      authModal.classList.remove('open');
      authModal.setAttribute('aria-hidden', 'true');
      if (authModalClose) authModalClose.style.display = '';
      setSettingsVisible(false);
    } else {
      authLinks.classList.remove('hidden');
      authUser.classList.add('hidden');
      authUser.innerHTML = '';
      if (typeof window.prefillCustomer === 'function') window.prefillCustomer('', '');
      customerGateActive = true;
      showLogin();
      showAuthModal();
      if (authModalClose) authModalClose.style.display = 'none';
      setSettingsVisible(false);
    }
    if (typeof window.onCustomerAuthChanged === 'function') window.onCustomerAuthChanged(currentCustomer);
  }

  async function loadAuthCustomer() {
    const token = getCustomerToken();
    if (!token) {
      renderCustomerUI(null);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders(token) });
      if (res.status === 401) {
        setCustomerToken(null);
        renderCustomerUI(null);
        return;
      }
      const user = await res.json();
      if (user && user.type === 'customer') renderCustomerUI(user);
      else renderCustomerUI(null);
    } catch (_) {
      renderCustomerUI(null);
    }
  }

  async function customerLogout() {
    const token = getCustomerToken();
    if (token) {
      try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: authHeaders(token) }); } catch (_) {}
      setCustomerToken(null);
    }
    renderCustomerUI(null);
  }

  window.loadAuthCustomer = loadAuthCustomer;
  window.getCurrentCustomer = function () { return currentCustomer; };
  window.openCustomerAuth = function () { showLogin(); showAuthModal(); };
  const adminModeBtn = document.getElementById('btn-admin-mode');
  if (adminModeBtn) {
    adminModeBtn.addEventListener('click', enterAdminMode);
  }
  const adminFromModalBtn = document.getElementById('btn-admin-from-modal');
  if (adminFromModalBtn) adminFromModalBtn.addEventListener('click', enterAdminMode);

  // Barber login (staff). If no barber has email yet, show settings for first-time setup without login.
  function checkBarberStaffAndLogin() {
    if (sessionStorage.getItem('barberStaff') !== '1') return;
    const token = getBarberToken();
    if (token) {
      fetch(`${API_BASE}/auth/me`, { headers: authHeaders(token) })
        .then(r => r.ok ? r.json() : null)
        .then(user => {
          if (user && user.type === 'barber') {
            barberLoginOverlay.classList.remove('open');
            barberLoginOverlay.setAttribute('aria-hidden', 'true');
            setSettingsVisible(true);
          } else {
            setBarberToken(null);
            tryShowBarberLoginOrSetup();
          }
        })
        .catch(() => {
          setBarberToken(null);
          tryShowBarberLoginOrSetup();
        });
    } else {
      tryShowBarberLoginOrSetup();
    }
  }

  function tryShowBarberLoginOrSetup() {
    fetch(`${API_BASE}/barbers`)
      .then(r => r.json())
      .then(barbers => {
        const anyWithEmail = (barbers || []).some(b => b.email);
        if (anyWithEmail) {
          barberLoginOverlay.classList.add('open');
          barberLoginOverlay.setAttribute('aria-hidden', 'false');
          setSettingsVisible(false);
        } else {
          barberLoginOverlay.classList.remove('open');
          barberLoginOverlay.setAttribute('aria-hidden', 'true');
          setSettingsVisible(false);
        }
      })
      .catch(() => {
        barberLoginOverlay.classList.add('open');
        barberLoginOverlay.setAttribute('aria-hidden', 'false');
        setSettingsVisible(false);
      });
  }

  formBarberLogin.addEventListener('submit', async function (e) {
    e.preventDefault();
    barberLoginMessage.textContent = '';
    barberLoginMessage.className = 'form-message';
    const username = document.getElementById('barber-username').value.trim().toLowerCase();
    const password = document.getElementById('barber-password').value;
    if (!username || !password) {
      barberLoginMessage.textContent = 'Username and password required.';
      barberLoginMessage.classList.add('error');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/auth/barber-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        barberLoginMessage.textContent = data.error || 'Login failed.';
        barberLoginMessage.classList.add('error');
        return;
      }
      setBarberToken(data.token);
      barberLoginOverlay.classList.remove('open');
      barberLoginOverlay.setAttribute('aria-hidden', 'true');
      setSettingsVisible(true);
    } catch (err) {
      barberLoginMessage.textContent = 'Network error.';
      barberLoginMessage.classList.add('error');
    }
  });

  window.getBarberToken = getBarberToken;
  window.getCustomerToken = getCustomerToken;
  window.authHeaders = authHeaders;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      loadAuthCustomer();
      setTimeout(checkBarberStaffAndLogin, 50);
    });
  } else {
    loadAuthCustomer();
    setTimeout(checkBarberStaffAndLogin, 50);
  }
})();
