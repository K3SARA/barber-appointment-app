# Hosting on Railway (Hobby Plan)

You can host this app on Railway so customers and barbers can use it from anywhere (no need for same WiFi).

---

## 1. Prepare the project

- The repo **root** has a `package.json` that runs the server. Railway will use it automatically.
- Make sure the project is in **Git** (e.g. GitHub). Railway deploys from a Git repo.

---

## 2. Create a Railway project

1. Go to [railway.app](https://railway.app) and sign in.
2. Click **New Project**.
3. Choose **Deploy from GitHub repo** and select this repository (or push this folder to a new repo and then select it).
4. Railway will detect Node.js and use the root `package.json` to build and run.

---

## 3. Environment variables

In your Railway project: **Variables** tab → add:

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No (set by Railway) | Railway sets this automatically. |
| `BASE_URL` | **Yes** | Your app URL, e.g. `https://your-app-name.up.railway.app` (see after first deploy). |
| `DB_PATH` | Recommended | Use for persistent DB, e.g. `/data/barber.db` (see Volumes below). |
| `PAYHERE_MERCHANT_ID` | No | For real payments (PayHere). |
| `PAYHERE_MERCHANT_SECRET` | No | For real payments. |
| `PAYHERE_SANDBOX` | No | Set `false` for live PayHere. |
| `TWILIO_ACCOUNT_SID` | No | For WhatsApp reminders. |
| `TWILIO_AUTH_TOKEN` | No | For WhatsApp. |
| `TWILIO_WHATSAPP_FROM` | No | e.g. `whatsapp:+14155238886`. |

After the first deploy, copy your public URL (e.g. `https://xxx.up.railway.app`) and set **`BASE_URL`** to that (with no trailing slash).

---

## 4. Persistent database (recommended)

By default, the SQLite file lives on the container filesystem and **is lost on redeploy**. To keep data:

1. In your Railway project, open your service.
2. Go to **Volumes** → **Add Volume**.
3. Mount path: **`/data`**.
4. In **Variables**, add: **`DB_PATH=/data/barber.db`**.

The database will then persist across deploys.

---

## 5. Deploy

- Push to your GitHub repo; Railway will redeploy automatically.
- Or use **Redeploy** in the Railway dashboard.
- Open the URL Railway gives you (e.g. `https://your-app.up.railway.app`).

---

## 6. After deploy

- **Customer app:** `https://your-app.up.railway.app`
- **Staff (barbers):** `https://your-app.up.railway.app/?staff=1`
- First time on staff: add a barber with **email + password**, then use that to log in and manage barbers/services.

---

## 7. Hobby plan notes

- Hobby plan is enough for this app (Node + SQLite, low traffic).
- If you use a **Volume** for `DB_PATH`, data survives redeploys and restarts.
- For custom domain: Railway → **Settings** → **Domains** (supported on Hobby).
