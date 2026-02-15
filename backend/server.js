const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4000;
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'barber.db');

// Salon: 10:00–21:00, 15-min slots. Booking fee 500 LKR (no refund).
const OPEN_HOUR = 10;
const OPEN_MIN = 0;
const CLOSE_HOUR = 21;
const CLOSE_MIN = 0;
const SLOT_MINUTES = 15;
const BOOKING_FEE_LKR = 500;
// Default salon timezone offset in minutes (JavaScript style: UTC - local).
// Sri Lanka (UTC+05:30) => -330.
const SALON_TZ_OFFSET_MINUTES = Number.isFinite(parseInt(process.env.SALON_TZ_OFFSET_MINUTES, 10))
  ? parseInt(process.env.SALON_TZ_OFFSET_MINUTES, 10)
  : -330;

// PayHere (payhere.lk). Set in env for production.
const PAYHERE_MERCHANT_ID = process.env.PAYHERE_MERCHANT_ID || '';
const PAYHERE_MERCHANT_SECRET = process.env.PAYHERE_MERCHANT_SECRET || '';
const PAYHERE_SANDBOX = process.env.PAYHERE_SANDBOX !== 'false';
const BASE_URL = process.env.BASE_URL || 'http://localhost:4000';

// WhatsApp (optional). e.g. Twilio: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || '';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || '';
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL,
      price REAL NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      notes TEXT,
      reminder_sent INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(barber_id) REFERENCES barbers(id),
      FOREIGN KEY(service_id) REFERENCES services(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'LKR',
      status TEXT NOT NULL DEFAULT 'pending',
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      barber_id INTEGER NOT NULL,
      service_id INTEGER NOT NULL,
      start_time TEXT NOT NULL,
      notes TEXT,
      appointment_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(barber_id) REFERENCES barbers(id),
      FOREIGN KEY(service_id) REFERENCES services(id),
      FOREIGN KEY(appointment_id) REFERENCES appointments(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT UNIQUE NOT NULL,
      user_type TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Add phone column if missing (migration)
  db.run('ALTER TABLE barbers ADD COLUMN phone TEXT', () => {});
  db.run('ALTER TABLE barbers ADD COLUMN email TEXT', () => {});
  db.run('ALTER TABLE barbers ADD COLUMN password_salt TEXT', () => {});
  db.run('ALTER TABLE barbers ADD COLUMN password_hash TEXT', () => {});
  db.run('ALTER TABLE appointments ADD COLUMN reminder_sent INTEGER NOT NULL DEFAULT 0', () => {});

  // Seed data if empty
  db.get('SELECT COUNT(*) as count FROM barbers', (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const stmt = db.prepare('INSERT INTO barbers (name, phone) VALUES (?, ?)');
      [['Navin', ''], ['Allen', ''], ['Classic Stylist', '']].forEach(([name, phone]) => stmt.run(name, phone));
      stmt.finalize();
    }
  });

  db.get('SELECT COUNT(*) as count FROM services', (err, row) => {
    if (err) return console.error(err);
    if (row.count === 0) {
      const stmt = db.prepare('INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)');
      stmt.run('Standard Haircut', 30, 25.0);
      stmt.run('Beard Trim', 15, 15.0);
      stmt.run('Haircut + Beard', 45, 35.0);
      stmt.finalize();
    }
  });
});

// Helpers
function calculateEndTime(startTime, durationMinutes) {
  const start = new Date(startTime);
  const end = new Date(start.getTime() + durationMinutes * 60000);
  return end.toISOString();
}

function localDateTimeToUtcMs(dateStr, hhmm, tzOffsetMinutes) {
  const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
  const [hh, mm] = String(hhmm).split(':').map(n => parseInt(n, 10));
  const utcBase = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  return utcBase + tzOffsetMinutes * 60000;
}

function addDaysYMD(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function utcMsToLocalYmdHm(utcMs, tzOffsetMinutes) {
  // Convert UTC epoch to "local" clock by offset, then read via UTC getters.
  const localMs = utcMs - tzOffsetMinutes * 60000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  return { ymd: `${y}-${m}-${day}`, hh, mm };
}

function isValidSalonSlotStart(startIso, tzOffsetMinutes) {
  const ms = new Date(startIso).getTime();
  if (!Number.isFinite(ms)) return false;
  const local = utcMsToLocalYmdHm(ms, tzOffsetMinutes);
  const total = local.hh * 60 + local.mm;
  const openTotal = OPEN_HOUR * 60 + OPEN_MIN;
  const closeTotal = CLOSE_HOUR * 60 + CLOSE_MIN;
  // Must be on 15-min boundary and start within opening hours.
  if (local.mm % SLOT_MINUTES !== 0) return false;
  if (total < openTotal || total >= closeTotal) return false;
  return true;
}

// All 15-min slot start times between 10:00 and 21:00 (last slot starts 20:45)
function getAllSlotStartsForDay(dateStr) {
  const slots = [];
  for (let h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      if (h === CLOSE_HOUR && m >= CLOSE_MIN) break;
      const hour = String(h).padStart(2, '0');
      const min = String(m).padStart(2, '0');
      slots.push(`${hour}:${min}`);
    }
  }
  return slots;
}

function slotStartToISO(dateStr, slotHHMM) {
  return new Date(`${dateStr}T${slotHHMM}:00`).toISOString();
}

function isSlotInPast(dateStr, slotHHMM) {
  const iso = slotStartToISO(dateStr, slotHHMM);
  return new Date(iso) <= new Date();
}

// Auth helpers
const SESSION_DAYS = 7;
function hashPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPin(pin, salt, hash) {
  const computed = crypto.scryptSync(String(pin), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const computed = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(computed, 'hex'));
}
function createSession(userType, userId, cb) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  db.run('INSERT INTO sessions (token, user_type, user_id, expires_at) VALUES (?, ?, ?, ?)', [token, userType, userId, expiresAt], function (err) {
    if (err) return cb(err);
    cb(null, token, expiresAt);
  });
}
function getSessionFromRequest(req, cb) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return cb(null, null);
  db.get('SELECT * FROM sessions WHERE token = ? AND expires_at > datetime(\'now\')', [token], (err, row) => {
    if (err) return cb(err);
    cb(null, row);
  });
}

// ----- Auth routes -----
app.post('/api/auth/register', (req, res) => {
  const { name, phone, pin } = req.body;
  const phoneNorm = (phone || '').trim().replace(/\s/g, '');
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  if (!phoneNorm) return res.status(400).json({ error: 'Phone is required' });
  if (!pin || String(pin).length < 4 || String(pin).length > 8) return res.status(400).json({ error: 'PIN must be 4–8 digits' });
  db.get('SELECT id FROM customers WHERE phone = ?', [phoneNorm], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Failed to check customer' });
    if (existing) return res.status(409).json({ error: 'This phone is already registered. Please login.' });
    const { salt, hash } = hashPin(pin);
    db.run('INSERT INTO customers (name, phone, pin_salt, pin_hash) VALUES (?, ?, ?, ?)', [name.trim(), phoneNorm, salt, hash], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to register' });
      const customerId = this.lastID;
      createSession('customer', customerId, (err3, token) => {
        if (err3) return res.status(500).json({ error: 'Failed to create session' });
        res.status(201).json({ token, user: { type: 'customer', id: customerId, name: name.trim(), phone: phoneNorm } });
      });
    });
  });
});

app.post('/api/auth/login', (req, res) => {
  const { phone, pin } = req.body;
  const phoneNorm = (phone || '').trim().replace(/\s/g, '');
  if (!phoneNorm || !pin) return res.status(400).json({ error: 'Phone and PIN required' });
  db.get('SELECT id, name, phone, pin_salt, pin_hash FROM customers WHERE phone = ?', [phoneNorm], (err, row) => {
    if (err) return res.status(500).json({ error: 'Login failed' });
    if (!row) return res.status(401).json({ error: 'Invalid phone or PIN' });
    if (!verifyPin(pin, row.pin_salt, row.pin_hash)) return res.status(401).json({ error: 'Invalid phone or PIN' });
    createSession('customer', row.id, (err2, token) => {
      if (err2) return res.status(500).json({ error: 'Login failed' });
      res.json({ token, user: { type: 'customer', id: row.id, name: row.name, phone: row.phone } });
    });
  });
});

app.post('/api/auth/barber-login', (req, res) => {
  const { username, email, password } = req.body;
  const usernameNorm = (username || email || '').trim().toLowerCase();
  if (!usernameNorm || !password) return res.status(400).json({ error: 'Username and password required' });

  // Fixed admin credentials
  if (usernameNorm === 'admin' && password === 'admin123') {
    return createSession('barber', 0, (err2, token) => {
      if (err2) return res.status(500).json({ error: 'Login failed' });
      res.json({ token, user: { type: 'barber', id: 0, name: 'Admin', username: 'admin' } });
    });
  }

  db.get('SELECT id, name, email, password_salt, password_hash FROM barbers WHERE email = ?', [usernameNorm], (err, row) => {
    if (err) return res.status(500).json({ error: 'Login failed' });
    if (!row || !row.password_hash) return res.status(401).json({ error: 'Invalid username or password' });
    if (!verifyPassword(password, row.password_salt, row.password_hash)) return res.status(401).json({ error: 'Invalid username or password' });
    createSession('barber', row.id, (err2, token) => {
      if (err2) return res.status(500).json({ error: 'Login failed' });
      res.json({ token, user: { type: 'barber', id: row.id, name: row.name } });
    });
  });
});

app.get('/api/auth/me', (req, res) => {
  getSessionFromRequest(req, (err, session) => {
    if (err) return res.status(500).json({ error: 'Failed to verify session' });
    if (!session) return res.status(401).json({ error: 'Not logged in' });
    if (session.user_type === 'customer') {
      db.get('SELECT id, name, phone FROM customers WHERE id = ?', [session.user_id], (e, row) => {
        if (e || !row) return res.status(401).json({ error: 'Not logged in' });
        res.json({ type: 'customer', id: row.id, name: row.name, phone: row.phone });
      });
    } else {
      if (session.user_id === 0) {
        return res.json({ type: 'barber', id: 0, name: 'Admin', username: 'admin' });
      }
      db.get('SELECT id, name FROM barbers WHERE id = ?', [session.user_id], (e, row) => {
        if (e || !row) return res.status(401).json({ error: 'Not logged in' });
        res.json({ type: 'barber', id: row.id, name: row.name });
      });
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  getSessionFromRequest(req, (err, session) => {
    if (err) return res.status(500).json({ error: 'Failed to verify session' });
    if (!session) return res.json({ success: true });
    db.run('DELETE FROM sessions WHERE token = ?', [session.token], () => res.json({ success: true }));
  });
});

function requireBarber(req, res, next) {
  getSessionFromRequest(req, (err, session) => {
    if (err) return res.status(500).json({ error: 'Failed to verify session' });
    if (!session || session.user_type !== 'barber') return res.status(403).json({ error: 'Barber login required' });
    req.barberSession = session;
    next();
  });
}

function requireCustomer(req, res, next) {
  getSessionFromRequest(req, (err, session) => {
    if (err) return res.status(500).json({ error: 'Failed to verify session' });
    if (!session || session.user_type !== 'customer') return res.status(403).json({ error: 'Customer login required' });
    req.customerSession = session;
    next();
  });
}

// Routes
app.get('/api/barbers', (req, res) => {
  db.all('SELECT id, name, phone, email FROM barbers ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch barbers' });
    res.json(rows.map(r => ({ id: r.id, name: r.name, phone: r.phone || '', email: r.email || '' })));
  });
});

app.post('/api/barbers', (req, res, next) => {
  // First barber with email can be created without login (setup); after that require barber session
  db.get('SELECT COUNT(*) as c FROM barbers WHERE email IS NOT NULL AND email != \'\'', [], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to check barbers' });
    if (row.c > 0) return requireBarber(req, res, next);
    next();
  });
}, (req, res) => {
  const { name, phone, email, password } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) return res.status(400).json({ error: 'Email is required for barber login' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  db.get('SELECT id FROM barbers WHERE email = ?', [emailNorm], (err, existing) => {
    if (err) return res.status(500).json({ error: 'Failed to check barber' });
    if (existing) return res.status(409).json({ error: 'Email already used by another barber' });
    const { salt, hash } = hashPassword(password);
    db.run('INSERT INTO barbers (name, phone, email, password_salt, password_hash) VALUES (?, ?, ?, ?, ?)', [name.trim(), (phone || '').trim(), emailNorm, salt, hash], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to create barber' });
      res.status(201).json({ id: this.lastID, name: name.trim(), phone: (phone || '').trim(), email: emailNorm });
    });
  });
});

app.put('/api/barbers/:id', requireBarber, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, phone, email, password } = req.body;
  if (isNaN(id) || !name || !name.trim()) return res.status(400).json({ error: 'Valid id and name required' });
  const emailNorm = (email || '').trim().toLowerCase();
  if (!emailNorm) return res.status(400).json({ error: 'Email is required for barber login' });
  db.get('SELECT id, password_salt, password_hash FROM barbers WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch barber' });
    if (!row) return res.status(404).json({ error: 'Barber not found' });
    let salt = row.password_salt;
    let hash = row.password_hash;
    if (password && String(password).length >= 6) {
      const pw = hashPassword(password);
      salt = pw.salt;
      hash = pw.hash;
    }
    db.run('UPDATE barbers SET name = ?, phone = ?, email = ?, password_salt = ?, password_hash = ? WHERE id = ?', [name.trim(), (phone || '').trim(), emailNorm, salt, hash, id], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to update barber' });
      if (this.changes === 0) return res.status(404).json({ error: 'Barber not found' });
      res.json({ id, name: name.trim(), phone: (phone || '').trim(), email: emailNorm });
    });
  });
});

app.delete('/api/barbers/:id', requireBarber, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Valid id required' });
  db.get('SELECT COUNT(*) as count FROM appointments WHERE barber_id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to check barber' });
    if (row.count > 0) return res.status(409).json({ error: 'Cannot delete barber with existing appointments' });
    db.run('DELETE FROM barbers WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to delete barber' });
      if (this.changes === 0) return res.status(404).json({ error: 'Barber not found' });
      res.json({ success: true });
    });
  });
});

app.get('/api/services', (req, res) => {
  db.all('SELECT * FROM services ORDER BY name', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch services' });
    res.json(rows);
  });
});

app.post('/api/services', requireBarber, (req, res) => {
  const { name, duration_minutes, price } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name is required' });
  const duration = parseInt(duration_minutes, 10);
  const priceNum = parseFloat(price);
  if (isNaN(duration) || duration < 5 || duration > 240) return res.status(400).json({ error: 'Duration must be 5–240 minutes' });
  if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Price must be a non-negative number' });
  db.run('INSERT INTO services (name, duration_minutes, price) VALUES (?, ?, ?)', [name.trim(), duration, priceNum], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to create service' });
    res.status(201).json({ id: this.lastID, name: name.trim(), duration_minutes: duration, price: priceNum });
  });
});

app.put('/api/services/:id', requireBarber, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { name, duration_minutes, price } = req.body;
  if (isNaN(id) || !name || !name.trim()) return res.status(400).json({ error: 'Valid id and name required' });
  const duration = parseInt(duration_minutes, 10);
  const priceNum = parseFloat(price);
  if (isNaN(duration) || duration < 5 || duration > 240) return res.status(400).json({ error: 'Duration must be 5–240 minutes' });
  if (isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Price must be a non-negative number' });
  db.run('UPDATE services SET name = ?, duration_minutes = ?, price = ? WHERE id = ?', [name.trim(), duration, priceNum, id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to update service' });
    if (this.changes === 0) return res.status(404).json({ error: 'Service not found' });
    res.json({ id, name: name.trim(), duration_minutes: duration, price: priceNum });
  });
});

app.delete('/api/services/:id', requireBarber, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Valid id required' });
  db.get('SELECT COUNT(*) as count FROM appointments WHERE service_id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to check service' });
    if (row.count > 0) return res.status(409).json({ error: 'Cannot delete service with existing appointments' });
    db.run('DELETE FROM services WHERE id = ?', [id], function (err2) {
      if (err2) return res.status(500).json({ error: 'Failed to delete service' });
      if (this.changes === 0) return res.status(404).json({ error: 'Service not found' });
      res.json({ success: true });
    });
  });
});

// Get available 15-min slot starts for a barber on a date (respects service duration and existing bookings)
app.get('/api/available-slots', (req, res) => {
  const { date, barber_id, service_id } = req.query;
  if (!date || !barber_id || !service_id) {
    return res.status(400).json({ error: 'Missing date, barber_id, or service_id' });
  }
  const barberId = parseInt(barber_id, 10);
  const serviceId = parseInt(service_id, 10);
  // Always use salon timezone so real-time slot logic is consistent.
  const tzOffsetMinutes = SALON_TZ_OFFSET_MINUTES;
  if (isNaN(barberId) || isNaN(serviceId)) {
    return res.status(400).json({ error: 'Invalid barber_id or service_id' });
  }

  db.get('SELECT duration_minutes FROM services WHERE id = ?', [serviceId], (err, service) => {
    if (err || !service) {
      return res.status(400).json({ error: 'Invalid service' });
    }
    const durationMinutes = service.duration_minutes;
    const dayStartUtcIso = new Date(localDateTimeToUtcMs(date, '00:00', tzOffsetMinutes)).toISOString();
    const nextDayUtcIso = new Date(localDateTimeToUtcMs(addDaysYMD(date, 1), '00:00', tzOffsetMinutes)).toISOString();
    const closingUtcMs = localDateTimeToUtcMs(date, `${String(CLOSE_HOUR).padStart(2, '0')}:${String(CLOSE_MIN).padStart(2, '0')}`, tzOffsetMinutes);

    db.all(
      `SELECT start_time, end_time
       FROM appointments
       WHERE barber_id = ?
         AND NOT (end_time <= ? OR start_time >= ?)`,
      [barberId, dayStartUtcIso, nextDayUtcIso],
      (err2, appointments) => {
        if (err2) return res.status(500).json({ error: 'Failed to fetch appointments' });

        const blocked = (appointments || []).map(a => ({ start: new Date(a.start_time).getTime(), end: new Date(a.end_time).getTime() }));
        const allSlots = getAllSlotStartsForDay(date);
        const available = [];

        for (const slotHHMM of allSlots) {
          const slotStart = localDateTimeToUtcMs(date, slotHHMM, tzOffsetMinutes);
          if (slotStart <= Date.now()) continue;
          const slotEnd = slotStart + durationMinutes * 60000;
          // Slot must end by closing time (21:00)
          if (slotEnd > closingUtcMs) continue;
          const overlaps = blocked.some(b => (slotStart < b.end && slotEnd > b.start));
          if (!overlaps) available.push(slotHHMM);
        }

        res.json(available);
      }
    );
  });
});

// Get appointments for a given date (YYYY-MM-DD)
app.get('/api/appointments', (req, res) => {
  const { date } = req.query;
  if (!date) {
    return res.status(400).json({ error: 'Missing date query param (YYYY-MM-DD)' });
  }
  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  getSessionFromRequest(req, (sessionErr, session) => {
    if (sessionErr) return res.status(500).json({ error: 'Failed to verify session' });
    const isBarber = session && session.user_type === 'barber';
    const query = isBarber
      ? `
        SELECT a.*, b.name as barber_name, b.phone as barber_phone, s.name as service_name, s.duration_minutes
        FROM appointments a
        JOIN barbers b ON a.barber_id = b.id
        JOIN services s ON a.service_id = s.id
        WHERE a.start_time BETWEEN ? AND ?
        ORDER BY a.start_time ASC
      `
      : `
        SELECT id, start_time, end_time
        FROM appointments
        WHERE start_time BETWEEN ? AND ?
        ORDER BY start_time ASC
      `;

    db.all(query, [startOfDay, endOfDay], (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch appointments' });
      res.json(rows);
    });
  });
});

// Create appointment (used after payment success; also kept for backward compat)
function createAppointmentFromPayment(payment, cb) {
  const { customer_name, customer_phone, barber_id, service_id, start_time, notes } = payment;
  db.get('SELECT duration_minutes FROM services WHERE id = ?', [service_id], (err, service) => {
    if (err || !service) return cb(err || new Error('Invalid service'));
    const end_time = calculateEndTime(start_time, service.duration_minutes);
    db.run(
      `INSERT INTO appointments (customer_name, customer_phone, barber_id, service_id, start_time, end_time, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [customer_name, customer_phone, barber_id, service_id, start_time, end_time || null, notes || null],
      function (err2) {
        if (err2) return cb(err2);
        cb(null, this.lastID);
      }
    );
  });
}

// Initiate booking: validate slot, create pending payment, return PayHere params (or error)
app.post('/api/initiate-booking', requireCustomer, (req, res) => {
  const { barber_id, service_id, start_time, notes } = req.body;
  if (!barber_id || !service_id || !start_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!isValidSalonSlotStart(start_time, SALON_TZ_OFFSET_MINUTES)) {
    return res.status(400).json({ error: 'Invalid start time for salon hours/slot rules' });
  }
  if (new Date(start_time).getTime() <= Date.now()) {
    return res.status(400).json({ error: 'Selected time has already passed' });
  }

  db.get('SELECT id, name, phone FROM customers WHERE id = ?', [req.customerSession.user_id], (custErr, customer) => {
    if (custErr || !customer) return res.status(401).json({ error: 'Customer account not found' });
    const customer_name = customer.name;
    const customer_phone = customer.phone;

    db.get('SELECT duration_minutes FROM services WHERE id = ?', [service_id], (err, service) => {
    if (err || !service) {
      return res.status(400).json({ error: 'Invalid service' });
    }
    const end_time = calculateEndTime(start_time, service.duration_minutes);

    db.get(
      `SELECT * FROM appointments WHERE barber_id = ? AND (
        (start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?)
      )`,
      [barber_id, end_time, start_time, start_time, end_time],
      (err2, existing) => {
        if (err2) return res.status(500).json({ error: 'Failed to check availability' });
        if (existing) {
          return res.status(409).json({ error: 'Time slot already booked for this barber' });
        }

        const orderId = `BARBER-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        db.run(
          `INSERT INTO payments (order_id, amount, currency, status, customer_name, customer_phone, barber_id, service_id, start_time, notes)
           VALUES (?, ?, 'LKR', 'pending', ?, ?, ?, ?, ?, ?)`,
          [orderId, BOOKING_FEE_LKR, customer_name, customer_phone, barber_id, service_id, start_time, notes || null],
          function (err3) {
            if (err3) return res.status(500).json({ error: 'Failed to create payment' });
            const paymentId = this.lastID;

            if (!PAYHERE_MERCHANT_ID || !PAYHERE_MERCHANT_SECRET) {
              // No PayHere: for dev, create appointment immediately and return success
              createAppointmentFromPayment(
                { customer_name, customer_phone, barber_id, service_id, start_time, notes: notes || null },
                (err4, apptId) => {
                  if (err4) return res.status(500).json({ error: 'Failed to create appointment' });
                  db.run('UPDATE payments SET status = ?, appointment_id = ? WHERE id = ?', ['paid', apptId, paymentId], () => {});
                  return res.status(201).json({
                    success: true,
                    payment_required: false,
                    message: 'Appointment booked (no payment gateway configured).',
                    order_id: orderId,
                    appointment_id: apptId
                  });
                }
              );
              return;
            }

            const returnUrl = `${BASE_URL}/api/payhere/return?order_id=${encodeURIComponent(orderId)}`;
            const cancelUrl = `${BASE_URL}/api/payhere/cancel?order_id=${encodeURIComponent(orderId)}`;
            const notifyUrl = `${BASE_URL}/api/payhere/notify`;
            const amount = BOOKING_FEE_LKR.toFixed(2);
            const currency = 'LKR';
            const hashStr = PAYHERE_MERCHANT_ID + orderId + amount + currency + PAYHERE_MERCHANT_SECRET;
            const hash = crypto.createHash('md5').update(hashStr).digest('hex').toUpperCase();

            const payhereUrl = PAYHERE_SANDBOX
              ? 'https://sandbox.payhere.lk/pay/'
              : 'https://www.payhere.lk/pay/';

            res.status(201).json({
              success: true,
              payment_required: true,
              order_id: orderId,
              payhere_url: payhereUrl,
              params: {
                merchant_id: PAYHERE_MERCHANT_ID,
                return_url: returnUrl,
                cancel_url: cancelUrl,
                notify_url: notifyUrl,
                order_id: orderId,
                items: 'Barber Appointment Booking',
                amount,
                currency,
                first_name: customer_name.split(' ')[0] || customer_name,
                last_name: customer_name.split(' ').slice(1).join(' ') || '.',
                email: `booking-${orderId}@barber.local`,
                phone: customer_phone,
                address: 'N. Allen Classics',
                city: 'Colombo',
                hash
              }
            });
          }
        );
      }
    );
    });
  });
});

// PayHere notify_url (server-to-server). Verify and create appointment.
app.post('/api/payhere/notify', (req, res) => {
  const body = req.body;
  const orderId = body.order_id;
  const paymentStatus = body.payment_status; // e.g. '2' for success in PayHere.lk
  if (!orderId) {
    return res.status(400).send('Missing order_id');
  }
  db.get('SELECT * FROM payments WHERE order_id = ? AND status = ?', [orderId, 'pending'], (err, pay) => {
    if (err || !pay) {
      return res.status(200).send('OK');
    }
    const isSuccess = String(paymentStatus) === '2' || body.status_code === '2' || body.payment_status === '2';
    if (!isSuccess) {
      db.run('UPDATE payments SET status = ? WHERE order_id = ?', ['failed', orderId], () => {});
      return res.status(200).send('OK');
    }
    createAppointmentFromPayment(
      {
        customer_name: pay.customer_name,
        customer_phone: pay.customer_phone,
        barber_id: pay.barber_id,
        service_id: pay.service_id,
        start_time: pay.start_time,
        notes: pay.notes
      },
      (err2, apptId) => {
        if (err2) {
          return res.status(500).send('Error creating appointment');
        }
        db.run('UPDATE payments SET status = ?, appointment_id = ? WHERE order_id = ?', ['paid', apptId, orderId], () => {});
        res.status(200).send('OK');
      }
    );
  });
});

// PayHere return_url (customer redirect). Frontend can read query and show success.
app.get('/api/payhere/return', (req, res) => {
  const { order_id } = req.query;
  const redirect = req.query.frontend_redirect || '/';
  const base = (req.query.web_base || '').replace(/\/$/, '');
  const url = base ? `${base}?payment=success&order_id=${encodeURIComponent(order_id || '')}` : `/?payment=success&order_id=${encodeURIComponent(order_id || '')}`;
  res.redirect(302, url);
});

app.get('/api/payhere/cancel', (req, res) => {
  const { order_id } = req.query;
  const base = (req.query.web_base || '').replace(/\/$/, '');
  const url = base ? `${base}?payment=cancelled&order_id=${encodeURIComponent(order_id || '')}` : `/?payment=cancelled&order_id=${encodeURIComponent(order_id || '')}`;
  res.redirect(302, url);
});

// Booking fee (for frontend)
app.get('/api/config', (req, res) => {
  res.json({
    booking_fee_lkr: BOOKING_FEE_LKR,
    open_time: `${String(OPEN_HOUR).padStart(2, '0')}:${String(OPEN_MIN).padStart(2, '0')}`,
    close_time: `${String(CLOSE_HOUR).padStart(2, '0')}:${String(CLOSE_MIN).padStart(2, '0')}`,
    slot_minutes: SLOT_MINUTES
  });
});

// Create appointment (direct, no payment – e.g. admin; or when payment gateway off)
app.post('/api/appointments', requireBarber, (req, res) => {
  const { customer_name, customer_phone, barber_id, service_id, start_time, notes } = req.body;
  if (!customer_name || !customer_phone || !barber_id || !service_id || !start_time) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  db.get('SELECT duration_minutes FROM services WHERE id = ?', [service_id], (err, service) => {
    if (err || !service) {
      return res.status(400).json({ error: 'Invalid service selected' });
    }
    const end_time = calculateEndTime(start_time, service.duration_minutes);
    db.get(
      `SELECT * FROM appointments WHERE barber_id = ? AND (
        (start_time < ? AND end_time > ?) OR (start_time >= ? AND start_time < ?)
      )`,
      [barber_id, end_time, start_time, start_time, end_time],
      (err2, existing) => {
        if (err2) return res.status(500).json({ error: 'Failed to check availability' });
        if (existing) return res.status(409).json({ error: 'Time slot already booked for this barber' });
        db.run(
          `INSERT INTO appointments (customer_name, customer_phone, barber_id, service_id, start_time, end_time, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [customer_name, customer_phone, barber_id, service_id, start_time, end_time, notes || null],
          function (err3) {
            if (err3) return res.status(500).json({ error: 'Failed to create appointment' });
            res.status(201).json({
              id: this.lastID,
              customer_name,
              customer_phone,
              barber_id,
              service_id,
              start_time,
              end_time,
              notes: notes || null
            });
          }
        );
      }
    );
  });
});

app.delete('/api/appointments/:id', requireBarber, (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM appointments WHERE id = ?', [id], function (err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete appointment' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json({ success: true });
  });
});

// ----- WhatsApp reminders (15 min before appointment) -----
function sendWhatsApp(toNumber, message) {
  const phone = toNumber.replace(/\D/g, '');
  const whatsappTo = phone.startsWith('94') ? `whatsapp:+${phone}` : `whatsapp:+94${phone.replace(/^0/, '')}`;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    console.log('[WhatsApp placeholder] To:', whatsappTo, 'Message:', message);
    return Promise.resolve();
  }
  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64');
  return fetch('https://api.twilio.com/2010-04-01/Accounts/' + TWILIO_ACCOUNT_SID + '/Messages.json', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + auth
    },
    body: new URLSearchParams({
      To: whatsappTo,
      From: TWILIO_WHATSAPP_FROM,
      Body: message
    })
  }).then(r => r.json()).catch(e => console.error('Twilio WhatsApp error:', e));
}

function runReminderJob() {
  const now = new Date();
  const in15 = new Date(now.getTime() + 15 * 60000);
  const windowStart = new Date(now.getTime() + 14 * 60000);
  const windowEnd = new Date(now.getTime() + 16 * 60000);

  db.all(
    `SELECT a.id, a.customer_name, a.customer_phone, a.reminder_sent, a.start_time,
            b.name as barber_name, b.phone as barber_phone, s.name as service_name
     FROM appointments a
     JOIN barbers b ON a.barber_id = b.id
     JOIN services s ON a.service_id = s.id
     WHERE a.reminder_sent = 0
       AND a.start_time >= ? AND a.start_time <= ?`,
    [windowStart.toISOString(), windowEnd.toISOString()],
    (err, rows) => {
      if (err) return console.error('Reminder job error:', err);
      (rows || []).forEach(row => {
        const customerMsg = '15 minutes to your appointment. Make sure you will be there on time.';
        const barberMsg = `In 15 minutes ${row.customer_name} visits the shop to do the ${row.service_name}.`;
        sendWhatsApp(row.customer_phone, customerMsg).then(() => {});
        const barberPhone = row.barber_phone || process.env.BARBER_DEFAULT_PHONE || '';
        if (barberPhone) {
          sendWhatsApp(barberPhone, barberMsg).then(() => {});
        } else {
          console.log('[WhatsApp placeholder] Barber (no phone):', barberMsg);
        }
        db.run('UPDATE appointments SET reminder_sent = 1 WHERE id = ?', [row.id], () => {});
      });
    }
  );
}

setInterval(runReminderJob, 60 * 1000);
runReminderJob();

// Serve web app (for mobile demo: one server, open from phone on same WiFi)
const webDir = path.join(__dirname, '..', 'web');
app.use(express.static(webDir));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) res.sendFile(path.join(webDir, 'index.html'));
  else res.status(404).send('Not found');
});

function getLocalIP() {
  const os = require('os');
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const n of nets[name]) {
      if (n.family === 'IPv4' && !n.internal) return n.address;
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('  Barber Appointment App');
  console.log('  =====================');
  console.log(`  On this PC:    http://localhost:${PORT}`);
  if (ip) console.log(`  On your phone: http://${ip}:${PORT}  (same WiFi)`);
  console.log('');
});

