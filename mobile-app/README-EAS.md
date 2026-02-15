## Expo Go + EAS APK

### 1. Set your live app URL
Create `.env` in `mobile-app`:

```env
EXPO_PUBLIC_APP_URL=https://your-app.up.railway.app
```

Use your real HTTPS backend/web URL.

### 2. Test in Expo Go

```bash
cd mobile-app
npm start
```

Scan the QR in Expo Go.

### 3. Build APK with EAS

```bash
cd mobile-app
npx eas-cli login
npx eas-cli build:configure
npx eas-cli build -p android --profile preview
```

`preview` profile is configured to output an APK.

### 4. Download APK
After build completes, EAS prints a URL to download the APK.

### Notes
- App icon is wired from your custom icon in `assets/icon.png` and adaptive icon.
- Admin and customer both use the same app (WebView).

