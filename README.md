## N. Allen Classics - Barber Appointment App

This project contains:

- A **Node/Express + SQLite backend** (`backend/`) that stores barbers, services, and appointments.
- A **mobile-first web app** (`web/`) that lets customers book and manage appointments from their phone browser.

### 1. Install and run the backend API

1. Open a terminal in this folder:

   ```bash
   cd "e:\N.Allen Classics\WebSite\Barber Appointment app\backend"
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the API:

   ```bash
   npm start
   ```

   The API runs on `http://localhost:4000`.

### 2. Open the mobile web app

You can serve the `web` folder with any static web server. Simplest option on Windows:

1. In a second terminal:

   ```bash
   cd "e:\N.Allen Classics\WebSite\Barber Appointment app\web"
   npx serve .
   ```

   (If `serve` is not installed, run `npm install -g serve` once and then use `serve .`.)

2. Open the printed URL in a mobile browser (or on your phone using the same Wi‑Fi and your PC’s IP).

The app is designed to look and feel like a native app on mobile.

**Behaviour:**
- Salon hours: **10:00–21:00**. Time slots are **15 minutes** (10:00, 10:15, … 20:45). Only available slots for the chosen barber and service are shown; past and already-booked slots are disabled.
- **Booking fee: 500 LKR** (Visa/Mastercard via PayHere). **No refunds.** Payment is required to confirm a booking.
- **WhatsApp reminders:** 15 minutes before an appointment, the customer gets: *"15 minutes to your appointment. Make sure you will be there on time."* The barber gets: *"In 15 minutes {customer name} visits the shop to do the {service name}."* To enable real WhatsApp sending, use Twilio (see below) and set each barber’s phone in the database.

**Optional – PayHere (Sri Lanka):**  
Set `PAYHERE_MERCHANT_ID`, `PAYHERE_MERCHANT_SECRET`, and optionally `PAYHERE_SANDBOX=false` for live. `BASE_URL` should be your backend URL (e.g. `https://your-api.com`). If these are not set, the server still runs and will create the appointment without payment (for local testing).

**Optional – WhatsApp (Twilio):**  
Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_FROM` (e.g. `whatsapp:+14155238886` for sandbox). Add each barber’s phone in the `barbers` table (column `phone`) so they receive reminders; otherwise only the customer message is sent and the barber message is logged.

### 3. Packaging as an Android APK (overview)

I cannot build or sign an APK directly from here, but you can wrap this web app into an installable APK in a few ways:

- **Option A – Trusted Web Activity (TWA / Bubblewrap):**
  - Host the `web` app at `https://your-domain`.
  - Install Bubblewrap on your machine: `npm install -g @bubblewrap/cli`.
  - Run `bubblewrap init` and point it at your HTTPS URL.
  - Follow prompts to generate an Android project, then build a release APK with Gradle from Android Studio.

- **Option B – WebView wrapper (Android Studio):**
  - Create a new **Empty Activity** project in Android Studio.
  - In `MainActivity`, load either your hosted URL or the local `index.html` from `/assets` using a `WebView`.
  - Build a signed release APK from Android Studio’s **Build > Generate Signed Bundle / APK…**.

If you tell me which approach you prefer (TWA vs. local WebView wrapper), I can generate the exact Android `MainActivity` and configuration files you can paste into an Android Studio project for a ready-to-build APK.

