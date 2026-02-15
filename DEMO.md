# N. Allen Classics – Demo (Run on Mobile)

This demo runs as **one server** so you can open it on your **phone** (same Wi‑Fi as your PC).

---

## How to run

1. **Install Node.js** from https://nodejs.org (LTS) if you don’t have it.
2. **Double‑click `start-demo.bat`** in this folder.
3. The server starts and prints two URLs:
   - **On this PC:** `http://localhost:4000`
   - **On your phone:** `http://192.168.x.x:4000` (your PC’s IP; same Wi‑Fi)
4. **On your phone:** Connect to the **same Wi‑Fi** as the PC, open the browser, and go to the **“On your phone”** URL (e.g. `http://192.168.1.5:4000`).
5. Use the app on your phone: register, book, view appointments.

Keep the black window open while using the demo. Close it to stop.

---

## What to try on mobile

### Customer
- **Register** (name, phone, PIN) → **Book** (barber, service, date, time slot) → **Pay 500 LKR & Book** (demo skips real payment).
- Scroll down to see **Today’s appointments**.

### Staff (shop owner)
- On your phone open: **same URL + `?staff=1`** (e.g. `http://192.168.1.5:4000/?staff=1`).
- **First time:** Settings (gear) appears → add a barber (name, phone, email, password).
- **Next time:** Barber login with that email/password → then use Settings to manage barbers and services.

---

## Tips

- **Same Wi‑Fi:** Phone and PC must be on the same network.
- **Firewall:** If the phone can’t connect, allow Node (or the script) through Windows Firewall for private networks.
- **Finding your IP:** If the server doesn’t show the phone URL, on the PC run `ipconfig` and look for “IPv4 Address” under your Wi‑Fi adapter.

---

## Handing to your client

Give them this folder (or a zip) with:
- `backend/`
- `web/`
- `start-demo.bat`
- `DEMO.md`

Tell them: install Node.js, double‑click `start-demo.bat`, then on their phone (same Wi‑Fi) open the URL shown as “On your phone” in the window.

---

*N. Allen Classics – Barber Appointment App Demo*
