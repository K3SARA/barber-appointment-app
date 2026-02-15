const API_BASE = (function () {
  try {
    const { protocol, hostname, port, origin } = window.location;
    if ((hostname === 'localhost' || hostname === '127.0.0.1') && port && port !== '4000') {
      return protocol + '//' + hostname + ':4000/api';
    }
    return origin + '/api';
  } catch (e) {
    return 'http://localhost:4000/api';
  }
})();

const barberSelect = document.getElementById('barber_id');
const serviceSelect = document.getElementById('service_id');
const dateInput = document.getElementById('date');
const timeInput = document.getElementById('time');
const timeSlotPicker = document.getElementById('time-slot-picker');
const bookingForm = document.getElementById('booking-form');
const formMessage = document.getElementById('form-message');
const submitBtn = document.getElementById('submit-booking');
const customerNameEl = document.getElementById('customer_name');
const customerPhoneEl = document.getElementById('customer_phone');
const bookingFeeEl = document.getElementById('booking-fee');
const payAmountEl = document.getElementById('pay-amount');
const appointmentsDateInput = document.getElementById('appointments-date');
const appointmentsList = document.getElementById('appointments-list');
const yearSpan = document.getElementById('year');
const paymentReturnEl = document.getElementById('payment-return-message');

let bookingFeeLKR = 500;

yearSpan.textContent = new Date().getFullYear();

// Staff mode: use ?staff=1 in the URL. Gear is shown only after barber login (see auth.js).
(function initStaffMode() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('staff') === '1') sessionStorage.setItem('barberStaff', '1');
})();

function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateInput(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function setDateMinToday() {
  const today = formatDateInput(new Date());
  dateInput.setAttribute('min', today);
  appointmentsDateInput.setAttribute('min', today);
}

async function loadConfig() {
  try {
    const res = await fetch(`${API_BASE}/config`);
    const cfg = await res.json();
    bookingFeeLKR = cfg.booking_fee_lkr || 500;
    if (bookingFeeEl) bookingFeeEl.textContent = bookingFeeLKR;
    if (payAmountEl) payAmountEl.textContent = bookingFeeLKR;
  } catch (_) {}
}

async function loadBarbers() {
  const res = await fetch(`${API_BASE}/barbers`);
  const barbers = await res.json();
  barberSelect.innerHTML = '<option value="" disabled selected>Select a barber</option>';
  barbers.forEach(b => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.name;
    barberSelect.appendChild(opt);
  });
}

async function loadServices() {
  const res = await fetch(`${API_BASE}/services`);
  const services = await res.json();
  serviceSelect.innerHTML = '<option value="" disabled selected>Select a service</option>';
  services.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = `${s.name} (${s.duration_minutes} min) Â· ${s.price} LKR`;
    serviceSelect.appendChild(opt);
  });
}

function renderTimeSlots(slots) {
  timeSlotPicker.innerHTML = '';
  timeInput.value = '';
  if (!slots || slots.length === 0) {
    timeSlotPicker.innerHTML = '<span class="slot-empty">No slots available. Try another date or barber.</span>';
    return;
  }
  slots.forEach(slotHHMM => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'time-slot-btn';
    btn.textContent = slotHHMM;
    btn.dataset.slot = slotHHMM;
    btn.addEventListener('click', () => {
      timeSlotPicker.querySelectorAll('.time-slot-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      timeInput.value = slotHHMM;
    });
    timeSlotPicker.appendChild(btn);
  });
}

async function loadAvailableSlots() {
  const date = dateInput.value;
  const barberId = barberSelect.value;
  const serviceId = serviceSelect.value;
  if (!date || !barberId || !serviceId) {
    renderTimeSlots([]);
    return;
  }
  try {
    const tzOffsetMinutes = new Date().getTimezoneOffset();
    const res = await fetch(
      `${API_BASE}/available-slots?date=${encodeURIComponent(date)}&barber_id=${encodeURIComponent(barberId)}&service_id=${encodeURIComponent(serviceId)}&tz_offset_minutes=${encodeURIComponent(tzOffsetMinutes)}`
    );
    const slots = await res.json();
    renderTimeSlots(Array.isArray(slots) ? slots : []);
  } catch (e) {
    renderTimeSlots([]);
  }
}

barberSelect.addEventListener('change', loadAvailableSlots);
serviceSelect.addEventListener('change', loadAvailableSlots);
dateInput.addEventListener('change', loadAvailableSlots);

async function loadAppointmentsForDate(dateStr) {
  appointmentsList.innerHTML = '<li>Loading...</li>';
  const staffMode = sessionStorage.getItem('barberStaff') === '1';
  const barberTokenRaw = typeof window.getBarberToken === 'function' ? window.getBarberToken() : null;
  const barberToken = staffMode ? barberTokenRaw : null;
  const headers = typeof window.authHeaders === 'function' ? window.authHeaders(barberToken) : {};
  const isBarberLoggedIn = !!barberToken;
  try {
    const res = await fetch(`${API_BASE}/appointments?date=${encodeURIComponent(dateStr)}`, { headers });
    const appointments = await res.json();
    appointmentsList.innerHTML = '';
    if (!appointments.length) {
      appointmentsList.innerHTML = '<li>No appointments for this day.</li>';
      return;
    }
    appointments.forEach(a => {
      const li = document.createElement('li');
      li.className = 'appointment-item';
      const main = document.createElement('div');
      main.className = 'appointment-main';
      if (isBarberLoggedIn && a.customer_name) {
        main.innerHTML = `
          <strong>${formatTime(a.start_time)} - ${formatTime(a.end_time)}</strong>
          ${a.customer_name} (${a.customer_phone})<br/>
          ${a.barber_name} - ${a.service_name}
        `;
      } else {
        main.innerHTML = `<strong>${formatTime(a.start_time)} - ${formatTime(a.end_time)}</strong>`;
      }
      li.appendChild(main);

      if (isBarberLoggedIn && a.notes) {
        const meta = document.createElement('div');
        meta.className = 'appointment-meta';
        meta.textContent = a.notes;
        li.appendChild(meta);
      }

      if (isBarberLoggedIn) {
        const actions = document.createElement('div');
        actions.className = 'appointment-actions';
        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'btn-secondary';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', async () => {
          if (!confirm('Cancel this appointment?')) return;
          const delHeaders = typeof window.authHeaders === 'function' ? window.authHeaders(barberToken) : {};
          const resDel = await fetch(`${API_BASE}/appointments/${a.id}`, { method: 'DELETE', headers: delHeaders });
          if (resDel.ok) loadAppointmentsForDate(dateStr);
          else alert('Failed to cancel appointment');
        });
        actions.appendChild(cancelBtn);
        li.appendChild(actions);
      }

      appointmentsList.appendChild(li);
    });
  } catch (e) {
    appointmentsList.innerHTML = '<li>Error loading appointments.</li>';
  }
}
function showPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const payment = params.get('payment');
  const orderId = params.get('order_id');
  if (!payment) return;
  paymentReturnEl.classList.add('show');
  if (payment === 'success') {
    paymentReturnEl.classList.remove('cancelled');
    paymentReturnEl.classList.add('success');
    paymentReturnEl.textContent = 'Payment successful. Your appointment is confirmed.';
  } else if (payment === 'cancelled') {
    paymentReturnEl.classList.remove('success');
    paymentReturnEl.classList.add('cancelled');
    paymentReturnEl.textContent = 'Payment was cancelled. You can book again when ready.';
  }
  if (orderId) {
    const todayStr = appointmentsDateInput.value || formatDateInput(new Date());
    loadAppointmentsForDate(todayStr);
  }
  history.replaceState({}, '', window.location.pathname + (window.location.hash || ''));
}

function submitToPayHere(params, payhereUrl) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = payhereUrl;
  form.style.display = 'none';
  Object.keys(params).forEach(key => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = key;
    input.value = params[key];
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formMessage.textContent = '';
  formMessage.className = 'form-message';
  const customer = typeof window.getCurrentCustomer === 'function' ? window.getCurrentCustomer() : null;
  const barber_id = parseInt(barberSelect.value, 10);
  const service_id = parseInt(serviceSelect.value, 10);
  const date = dateInput.value;
  const time = timeInput.value;
  const notes = document.getElementById('notes').value.trim();

  if (!customer) {
    formMessage.textContent = 'Please login first.';
    formMessage.classList.add('error');
    if (typeof window.openCustomerAuth === 'function') window.openCustomerAuth();
    return;
  }

  if (!barber_id || !service_id || !date || !time) {
    formMessage.textContent = 'Please select barber, service, date and time slot.';
    formMessage.classList.add('error');
    return;
  }

  const start_time = new Date(`${date}T${time}:00`).toISOString();
  submitBtn.disabled = true;

  try {
    const customerToken = typeof window.getCustomerToken === 'function' ? window.getCustomerToken() : null;
    const auth = typeof window.authHeaders === 'function' ? window.authHeaders(customerToken) : {};
    const res = await fetch(`${API_BASE}/initiate-booking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...auth },
      body: JSON.stringify({
        barber_id,
        service_id,
        start_time,
        notes
      })
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      formMessage.textContent = data.error || 'Booking failed.';
      formMessage.classList.add('error');
      submitBtn.disabled = false;
      return;
    }

    if (data.payment_required && data.payhere_url && data.params) {
      const webBase = window.location.origin + window.location.pathname;
      const returnUrl = `${API_BASE.replace(/\/api\/?$/, '')}/api/payhere/return?order_id=${encodeURIComponent(data.order_id)}&web_base=${encodeURIComponent(webBase)}`;
      const cancelUrl = `${API_BASE.replace(/\/api\/?$/, '')}/api/payhere/cancel?order_id=${encodeURIComponent(data.order_id)}&web_base=${encodeURIComponent(webBase)}`;
      const params = {
        ...data.params,
        return_url: returnUrl,
        cancel_url: cancelUrl
      };
      submitToPayHere(params, data.payhere_url);
      return;
    }

    formMessage.textContent = data.message || 'Appointment booked successfully!';
    formMessage.classList.add('success');
    bookingForm.reset();
    timeInput.value = '';
    renderTimeSlots([]);
    const todayStr = appointmentsDateInput.value || formatDateInput(new Date());
    appointmentsDateInput.value = todayStr;
    loadAppointmentsForDate(todayStr);
  } catch (err) {
    formMessage.textContent = 'Network error. Please try again.';
    formMessage.classList.add('error');
  }
  submitBtn.disabled = false;
});

// Initialize
const today = new Date();
const todayStr = formatDateInput(today);
dateInput.value = todayStr;
appointmentsDateInput.value = todayStr;
setDateMinToday();
loadConfig();
loadBarbers();
loadServices();
loadAppointmentsForDate(todayStr);
showPaymentReturn();

// Expose for settings panel refresh
window.loadBarbers = loadBarbers;
window.loadServices = loadServices;

// Prefill name/phone when customer is logged in (called from auth.js)
window.prefillCustomer = function (name, phone) {
  if (customerNameEl) customerNameEl.value = name || '';
  if (customerPhoneEl) customerPhoneEl.value = phone || '';
};

window.onCustomerAuthChanged = function (customer) {
  const loggedIn = !!customer;
  const nameField = customerNameEl ? customerNameEl.closest('.field') : null;
  const phoneField = customerPhoneEl ? customerPhoneEl.closest('.field') : null;
  if (customerNameEl) customerNameEl.readOnly = true;
  if (customerPhoneEl) customerPhoneEl.readOnly = true;
  if (nameField) nameField.style.display = loggedIn ? 'none' : '';
  if (phoneField) phoneField.style.display = loggedIn ? 'none' : '';
  if (!loggedIn) {
    if (customerNameEl) customerNameEl.value = '';
    if (customerPhoneEl) customerPhoneEl.value = '';
  }
  submitBtn.disabled = !loggedIn;
};

appointmentsDateInput.addEventListener('change', () => {
  if (appointmentsDateInput.value) loadAppointmentsForDate(appointmentsDateInput.value);
});


