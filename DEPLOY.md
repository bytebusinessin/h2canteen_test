# Bytebiz Vendor App — Deployment Guide

## Project Stack
- React + TypeScript + Vite PWA
- Firebase Firestore (database) + Firebase Hosting (live URL)
- PWABuilder → Android APK / AAB
- Google Play Console (internal testing → production)

---

## 1. Make Code Changes

Edit files in `/Users/rahuldara/ByteBiz/android_mobileApp/src/`

---

## 2. Build the App

```bash
cd /Users/rahuldara/ByteBiz/android_mobileApp
npm run build
```

Output goes to `dist/` folder. Must run this before every deploy.

---

## 3. Deploy to Firebase Hosting (Live Web App)

```bash
firebase deploy --only hosting
```

Live URL: **https://aromas-794de.web.app**

This updates the app instantly for all users — no APK reinstall needed since the TWA loads the live URL.

**If not logged in to Firebase:**
```bash
firebase login
```

**If firebase.json is missing:**
```bash
firebase init hosting
# Public directory: dist
# Single page app: Yes
# Overwrite index.html: No
```

---

## 4. Build + Deploy in One Command

```bash
cd /Users/rahuldara/ByteBiz/android_mobileApp && npm run build && firebase deploy --only hosting
```

---

## 5. Generate Android APK / AAB (PWABuilder)

Only needed when you want to publish a new version to the Play Store or distribute the APK.

1. Go to **https://pwabuilder.com**
2. Enter URL: `https://aromas-794de.web.app`
3. Click **Package for stores → Android**
4. Settings:
   - Package ID: `com.bytebiz.vendor`
   - App name: `Bytebiz`
   - Theme color: `#ffffff`
   - Navigation color: `#ffffff`
   - Version: increment each release (e.g. 1.0.1, 1.0.2)
5. Under **Signing** → upload existing keystore:
   - Keystore file: `~/ByteBiz/keys/bytebiz-release.keystore`
   - Passwords and alias: from `~/ByteBiz/keys/signing-key-info.txt`
6. Download the zip — contains:
   - `Bytebiz.aab` → upload to Play Store
   - `Bytebiz.apk` → sideload directly on phone
   - `assetlinks.json` → already deployed, don't need to replace

> **Important:** Always use the same keystore. Losing it means you can't update the Play Store app.

---

## 6. Upload to Google Play Console

1. Go to **play.google.com/console**
2. Select **Bytebiz** app
3. **Testing → Internal testing → Create new release**
4. Upload `Bytebiz.aab`
5. Release name: `1.0.x` (match the version you set in PWABuilder)
6. Release notes: what changed
7. Click **Next → Start rollout**

**Add testers:**
- Testing → Internal testing → Testers tab
- Add Gmail addresses
- Share the opt-in link with testers

---

## 7. Fix TWA URL Bar (assetlinks.json)

The URL bar disappears when `assetlinks.json` is verified by Android.

File location: `public/.well-known/assetlinks.json`
Live URL: `https://aromas-794de.web.app/.well-known/assetlinks.json`

The file must contain the **SHA-256 fingerprint of the signing certificate used by the installed APK**.

- **Sideloaded APK** (from PWABuilder zip) → uses `signing.keystore` fingerprint (already in assetlinks.json)
- **Play Store APK** → uses Google Play's signing key → get from Play Console → **Setup → App integrity → App signing key certificate → SHA-256**

Update `public/.well-known/assetlinks.json` with the correct fingerprint, then redeploy:
```bash
npm run build && firebase deploy --only hosting
```

---

## 8. Key Files

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app code |
| `src/types.ts` | TypeScript types |
| `src/firebase.ts` | Firebase config |
| `public/manifest.json` | PWA manifest (name, colors, icons) |
| `public/.well-known/assetlinks.json` | Android TWA verification |
| `public/logo.png` | App logo |
| `public/icon-192.png` | PWA icon 192px |
| `public/icon-512.png` | PWA icon 512px |
| `firebase.json` | Firebase Hosting config |
| `index.html` | HTML entry point |

---

## 9. Signing Key — Keep Safe

```
~/ByteBiz/keys/bytebiz-release.keystore   ← the key file
~/ByteBiz/keys/signing-key-info.txt       ← passwords and alias
```

**Never delete these.** Without the keystore you cannot publish updates to the same Play Store listing.

---

## 10. Firebase Collections (Firestore)

| Collection | Purpose |
|-----------|---------|
| `orders` | All orders (online + POS) |
| `settings/storeSettings` | Store name, hours, GST, isOpen |
| `vendors` | Vendor email |
| `products` | Online menu items |
| `posProducts` | POS menu items |
| `analytics` | Dashboard stats |

---

## 11. Common Issues

| Problem | Fix |
|---------|-----|
| URL bar showing in installed app | `assetlinks.json` fingerprint mismatch — get correct SHA-256 from Play Console → App integrity |
| Changes not showing in app | Forgot to run `npm run build` before deploy |
| `firebase deploy` fails | Run `firebase login` first |
| PWABuilder Package ID error | Retype `com.bytebiz.vendor` manually, don't copy-paste |
| Orders showing before payment | Filter checks `payment_status === 'SUCCESS'` — already fixed in code |
| Orange status/nav bar | Rebuild APK from PWABuilder with `theme_color: #ffffff` |
