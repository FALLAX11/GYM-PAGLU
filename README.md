# 🏋️ GYM PAGLU

### Your Personal Fitness & Workout Companion

**GYM PAGLU** is an all-in-one fitness tracking application designed to help users manage their workouts, monitor nutrition, track fitness progress, and get AI-powered fitness guidance.

Built with a focus on simplicity, usability, and personalized fitness tracking.

---

## ✨ Features

### 💪 Workout Tracking

- Track daily workout sessions.
- Explore an extensive exercise catalog.
- Organize exercises by muscle groups.
- Create and manage workout plans.
- Record sets, reps, weights, and RPE.
- Support for advanced workout structures, including supersets.
- Track workout history and progress.

### 🥗 Nutrition Tracking

- Track daily food and nutrition intake.
- Monitor calories and macronutrients.
- Set personalized nutrition goals.
- Track nutrition check-ins.
- Get adaptive nutrition guidance.

### 🤖 AI Fitness Coach

- AI-powered fitness assistance.
- Personalized fitness recommendations.
- Workout and nutrition guidance.
- Conversational AI experience.
- Streaming responses.
- Primary AI provider: Groq.
- Fallback AI provider: OpenRouter.

### 📊 Fitness Analytics

- Monitor workout performance.
- Track fitness progress.
- Review workout history.
- Analyze training activity.

### ☁️ Cloud & Account Management

- Supabase-powered authentication.
- Cloud database integration.
- User-specific fitness data.
- Secure backend AI integration.
- Row Level Security (RLS) support.

---

## 🛠️ Tech Stack

| Technology   | Purpose                     |
| ------------ | --------------------------- |
| React        | Frontend                    |
| TypeScript   | Type safety                 |
| Vite         | Development and build       |
| Tailwind CSS | UI styling                  |
| Capacitor    | Android application         |
| Supabase     | Authentication and database |
| PostgreSQL   | Data storage                |
| Groq         | Primary AI provider         |
| OpenRouter   | AI fallback provider        |

---

## 📱 Android App

GYM PAGLU is packaged as an Android application using Capacitor.

**Download the latest APK:**

👉 Visit the [Releases](https://github.com/FALLAX11/GYM-PAGLU/releases) section.

Download the latest `.apk` file and install it on your Android device.

---

## 🚀 Run Locally

### Prerequisites

- Node.js and npm
- Git
- Supabase project

### 1. Clone the repository

```bash
git clone https://github.com/FALLAX11/GYM-PAGLU.git
```

### 2. Enter the project directory

```bash
cd GYM-PAGLU
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```env
VITE_SUPABASE_URL=YOUR_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

Use your own Supabase project credentials.

### 5. Start the development server

```bash
npm run dev
```

### 6. Build the application

```bash
npm run build
```

---

## 📦 Android Build

To build the Android application locally:

```bash
npm install @capacitor/android
```

If the Android platform has not been added yet:

```bash
npx cap add android
```

Build the web application and synchronize Android:

```bash
npm run build
npx cap sync android
```

Open the Android project:

```bash
npx cap open android
```

You can then generate an APK using Android Studio.

---

## 🔐 Security

- Supabase credentials are configured through environment variables.
- AI provider API keys are stored as Supabase Edge Function secrets.
- Sensitive signing keys should never be committed to the repository.
- Database access is protected using Supabase Row Level Security policies.

**Never upload your service-role key, AI provider API keys, or Android signing keystore to GitHub.**

---

## 🗺️ Future Improvements

- More advanced fitness analytics.
- Additional workout and nutrition insights.
- Improved AI coaching capabilities.
- More personalization options.
- Additional fitness tracking features.

---

## 👨‍💻 Developer

**BEDABRAT LASKAR**

Created with ❤️, curiosity, and a lot of AI-assisted coding.

### GitHub

[https://github.com/FALLAX11](https://github.com/FALLAX11)

---

## 📄 License

License information will be added later.
