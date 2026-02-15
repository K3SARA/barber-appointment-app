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
  const overlay = document.getElementById('settings-overlay');
  const btnSettings = document.getElementById('btn-settings');
  const btnClose = document.getElementById('settings-close');
  const tabs = document.querySelectorAll('.settings-tab');
  const contentBarbers = document.getElementById('settings-barbers');
  const contentServices = document.getElementById('settings-services');

  let editingBarberId = null;
  let editingServiceId = null;

  function barberAuthHeaders() {
    const t = typeof window.getBarberToken === 'function' ? window.getBarberToken() : null;
    const auth = typeof window.authHeaders === 'function' ? window.authHeaders(t) : {};
    return { 'Content-Type': 'application/json', ...auth };
  }

  function openSettings() {
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    loadSettingsBarbers();
    loadSettingsServices();
  }

  function closeSettings() {
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    hideBarberForm();
    hideServiceForm();
  }

  btnSettings.addEventListener('click', openSettings);
  btnClose.addEventListener('click', closeSettings);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeSettings();
  });

  tabs.forEach(tab => {
    tab.addEventListener('click', function () {
      const t = this.dataset.tab;
      tabs.forEach(x => x.classList.remove('active'));
      contentBarbers.classList.toggle('active', t === 'barbers');
      contentServices.classList.toggle('active', t === 'services');
      this.classList.add('active');
    });
  });

  function loadSettingsBarbers() {
    fetch(`${API_BASE}/barbers`)
      .then(r => r.json())
      .then(barbers => {
        const list = document.getElementById('settings-barbers-list');
        list.innerHTML = '';
        barbers.forEach(b => {
          const li = document.createElement('li');
          const meta = [b.phone, b.email].filter(Boolean).map(x => escapeHtml(x)).join(' · ');
          li.innerHTML = `
            <span><span class="label">${escapeHtml(b.name)}</span>${meta ? `<span class="meta"> ${meta}</span>` : ''}</span>
            <span class="row-actions">
              <button type="button" class="btn-edit" data-id="${b.id}">Edit</button>
              <button type="button" class="btn-delete" data-id="${b.id}">Delete</button>
            </span>
          `;
          li.querySelector('.btn-edit').addEventListener('click', () => showBarberForm(b));
          li.querySelector('.btn-delete').addEventListener('click', () => deleteBarber(b.id, b.name));
          list.appendChild(li);
        });
      })
      .catch(() => { document.getElementById('settings-barbers-list').innerHTML = '<li>Failed to load barbers.</li>'; });
  }

  function loadSettingsServices() {
    fetch(`${API_BASE}/services`)
      .then(r => r.json())
      .then(services => {
        const list = document.getElementById('settings-services-list');
        list.innerHTML = '';
        services.forEach(s => {
          const li = document.createElement('li');
          li.innerHTML = `
            <span><span class="label">${escapeHtml(s.name)}</span><span class="meta"> ${s.duration_minutes} min · ${s.price} LKR</span></span>
            <span class="row-actions">
              <button type="button" class="btn-edit" data-id="${s.id}">Edit</button>
              <button type="button" class="btn-delete" data-id="${s.id}">Delete</button>
            </span>
          `;
          li.querySelector('.btn-edit').addEventListener('click', () => showServiceForm(s));
          li.querySelector('.btn-delete').addEventListener('click', () => deleteService(s.id, s.name));
          list.appendChild(li);
        });
      })
      .catch(() => { document.getElementById('settings-services-list').innerHTML = '<li>Failed to load services.</li>'; });
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function refreshBookingDropdowns() {
    if (typeof window.loadBarbers === 'function') window.loadBarbers();
    if (typeof window.loadServices === 'function') window.loadServices();
  }

  // ----- Barbers form -----
  const barberFormEl = document.getElementById('barber-form');
  const barberFormTitle = document.getElementById('barber-form-title');
  const barberNameInput = document.getElementById('barber-name');
  const barberPhoneInput = document.getElementById('barber-phone');
  const barberEmailInput = document.getElementById('barber-form-email');
  const barberPasswordInput = document.getElementById('barber-form-password');
  const barberFormMessage = document.getElementById('barber-form-message');
  const barberSaveBtn = document.getElementById('barber-save');
  const barberCancelBtn = document.getElementById('barber-cancel');
  document.getElementById('barber-add').addEventListener('click', () => { editingBarberId = null; showBarberForm({ name: '', phone: '', email: '' }); });

  function showBarberForm(barber) {
    editingBarberId = barber.id || null;
    barberFormTitle.textContent = editingBarberId ? 'Edit barber' : 'Add barber';
    barberNameInput.value = barber.name || '';
    barberPhoneInput.value = barber.phone || '';
    barberEmailInput.value = barber.email || '';
    barberPasswordInput.value = '';
    barberEmailInput.required = true;
    barberFormMessage.textContent = '';
    barberFormEl.classList.remove('hidden');
  }

  function hideBarberForm() {
    barberFormEl.classList.add('hidden');
    editingBarberId = null;
  }

  barberCancelBtn.addEventListener('click', hideBarberForm);

  barberSaveBtn.addEventListener('click', async () => {
    const name = barberNameInput.value.trim();
    const phone = barberPhoneInput.value.trim();
    const email = barberEmailInput.value.trim().toLowerCase();
    const password = barberPasswordInput.value;
    barberFormMessage.textContent = '';
    barberFormMessage.className = 'form-message';
    if (!name) {
      barberFormMessage.textContent = 'Name is required.';
      barberFormMessage.classList.add('error');
      return;
    }
    if (!email) {
      barberFormMessage.textContent = 'Email is required for barber login.';
      barberFormMessage.classList.add('error');
      return;
    }
    if (!editingBarberId && (!password || password.length < 6)) {
      barberFormMessage.textContent = 'Password must be at least 6 characters.';
      barberFormMessage.classList.add('error');
      return;
    }
    try {
      const url = editingBarberId ? `${API_BASE}/barbers/${editingBarberId}` : `${API_BASE}/barbers`;
      const method = editingBarberId ? 'PUT' : 'POST';
      const body = { name, phone, email };
      if (password.length >= 6) body.password = password;
      const res = await fetch(url, { method, headers: barberAuthHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        barberFormMessage.textContent = data.error || 'Failed to save.';
        barberFormMessage.classList.add('error');
        return;
      }
      barberFormMessage.textContent = 'Saved.';
      barberFormMessage.classList.add('success');
      loadSettingsBarbers();
      refreshBookingDropdowns();
      setTimeout(hideBarberForm, 800);
    } catch (e) {
      barberFormMessage.textContent = 'Network error.';
      barberFormMessage.classList.add('error');
    }
  });

  function deleteBarber(id, name) {
    if (!confirm(`Delete barber "${name}"? This will fail if they have appointments.`)) return;
    fetch(`${API_BASE}/barbers/${id}`, { method: 'DELETE', headers: barberAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.error) alert(data.error);
        else {
          loadSettingsBarbers();
          refreshBookingDropdowns();
        }
      })
      .catch(() => alert('Network error.'));
  }

  // ----- Services form -----
  const serviceFormEl = document.getElementById('service-form');
  const serviceFormTitle = document.getElementById('service-form-title');
  const serviceNameInput = document.getElementById('service-name');
  const serviceDurationInput = document.getElementById('service-duration');
  const servicePriceInput = document.getElementById('service-price');
  const serviceFormMessage = document.getElementById('service-form-message');
  const serviceSaveBtn = document.getElementById('service-save');
  const serviceCancelBtn = document.getElementById('service-cancel');
  document.getElementById('service-add').addEventListener('click', () => { editingServiceId = null; showServiceForm({ name: '', duration_minutes: 30, price: 0 }); });

  function showServiceForm(service) {
    editingServiceId = service.id || null;
    serviceFormTitle.textContent = editingServiceId ? 'Edit service' : 'Add service';
    serviceNameInput.value = service.name || '';
    serviceDurationInput.value = service.duration_minutes != null ? service.duration_minutes : 30;
    servicePriceInput.value = service.price != null ? service.price : 0;
    serviceFormMessage.textContent = '';
    serviceFormEl.classList.remove('hidden');
  }

  function hideServiceForm() {
    serviceFormEl.classList.add('hidden');
    editingServiceId = null;
  }

  serviceCancelBtn.addEventListener('click', hideServiceForm);

  serviceSaveBtn.addEventListener('click', async () => {
    const name = serviceNameInput.value.trim();
    const duration = parseInt(serviceDurationInput.value, 10);
    const price = parseFloat(servicePriceInput.value);
    serviceFormMessage.textContent = '';
    serviceFormMessage.className = 'form-message';
    if (!name) {
      serviceFormMessage.textContent = 'Name is required.';
      serviceFormMessage.classList.add('error');
      return;
    }
    if (isNaN(duration) || duration < 5 || duration > 240) {
      serviceFormMessage.textContent = 'Duration must be 5–240 minutes.';
      serviceFormMessage.classList.add('error');
      return;
    }
    if (isNaN(price) || price < 0) {
      serviceFormMessage.textContent = 'Price must be 0 or more.';
      serviceFormMessage.classList.add('error');
      return;
    }
    try {
      const url = editingServiceId ? `${API_BASE}/services/${editingServiceId}` : `${API_BASE}/services`;
      const method = editingServiceId ? 'PUT' : 'POST';
      const body = { name, duration_minutes: duration, price };
      const res = await fetch(url, { method, headers: barberAuthHeaders(), body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        serviceFormMessage.textContent = data.error || 'Failed to save.';
        serviceFormMessage.classList.add('error');
        return;
      }
      serviceFormMessage.textContent = 'Saved.';
      serviceFormMessage.classList.add('success');
      loadSettingsServices();
      refreshBookingDropdowns();
      setTimeout(hideServiceForm, 800);
    } catch (e) {
      serviceFormMessage.textContent = 'Network error.';
      serviceFormMessage.classList.add('error');
    }
  });

  function deleteService(id, name) {
    if (!confirm(`Delete service "${name}"? This will fail if it has appointments.`)) return;
    fetch(`${API_BASE}/services/${id}`, { method: 'DELETE', headers: barberAuthHeaders() })
      .then(r => r.json())
      .then(data => {
        if (data.error) alert(data.error);
        else {
          loadSettingsServices();
          refreshBookingDropdowns();
        }
      })
      .catch(() => alert('Network error.'));
  }
})();
