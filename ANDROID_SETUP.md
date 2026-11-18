# GYM PAGLU — Setup, Supabase & Android APK Build Guide

**Tagline:** Your Fitness. Your Rules.

---

## 1. Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from your Supabase Project Settings > API

# 3. Start Vite development server
npm run dev

# 4. Run TypeScript check and production build
npm run lint
npm run build
```

---

## 2. Supabase Cloud Backend Setup (Free Tier Ready)

1. Create a free project at [supabase.com](https://supabase.com).
2. Run the two SQL migrations in `supabase/migrations/` (either via Supabase SQL Editor or Supabase CLI):
   - `supabase/migrations/20261118000001_initial_schema.sql` (Tables, Indexes, Triggers, Private Storage Bucket, RLS Policies)
   - `supabase/migrations/20261118000002_seed_catalogs.sql` (Exercises, Splits, Indian & Global Foods)
3. Under **Authentication → Providers → Email**, keep **Email/Password** enabled and **Confirm email** enabled for verification.
4. Under **Authentication → URL Configuration**, add your redirect URLs (e.g. `http://localhost:3000/reset-password`, `https://your-domain/reset-password`, and `com.gympaglu.app://reset-password` for Android deep links).

### Deploy AI Coach Edge Function (Groq Primary + OpenRouter Fallback)

```bash
# Login & link project
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF

# Set AI secrets strictly server-side (never in frontend .env!)
npx supabase secrets set GROQ_API_KEY="gsk_..."
npx supabase secrets set GROQ_MODEL="llama-3.3-70b-versatile"
npx supabase secrets set OPENROUTER_API_KEY="sk-or-v1-..."
npx supabase secrets set OPENROUTER_MODEL="meta-llama/llama-3.3-70b-instruct:free"
npx supabase secrets set AI_DAILY_LIMIT="30"

# Deploy Edge Function
npx supabase functions deploy ai-coach
```

---

## 3. Capacitor Android Packaging & APK Build

### Install Android Platform & Sync

```bash
# 1. Build production web bundle
npm run build

# 2. Install @capacitor/android (if not yet added) and create android/ project
npm install @capacitor/android
npx cap add android

# 3. Sync built assets & native plugins (StatusBar, Keyboard, App, Haptics)
npx cap sync android

# 4. Open in Android Studio
npx cap open android
```

### Android Status Bar & Safe Area Verification Checklist
- `capacitor.config.ts` sets `StatusBar.overlaysWebView = false`, `style = 'DARK'`, and `backgroundColor = '#08090B'`.
- `index.html` uses `viewport-fit=cover`.
- `src/styles/theme.css` structures the shell into non-overlapping `.app-system-bar` (`env(safe-area-inset-top)`), `.app-header-bar`, `.app-scroll-region`, and `.app-bottom-nav` (`env(safe-area-inset-bottom)`).
- Test on both 3-button Android navigation and Android gesture navigation emulators/devices to verify bottom nav and scroll bottom clearance.

### Building Debug & Signed Release APKs

```bash
# Navigate to android folder and generate Debug APK
cd android
./gradlew assembleDebug
# Output: android/app/build/outputs/apk/debug/app-debug.apk

# Generate Signed Release APK (after configuring signingConfigs in android/app/build.gradle)
keytool -genkey -v -keystore gympaglu-release.keystore -alias gympaglu -keyalg RSA -keysize 2048 -validity 10000
./gradlew assembleRelease
# Output: android/app/build/outputs/apk/release/app-release.apk
```
