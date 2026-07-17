# CAP-23: Blood Donation Management System

A robust, strictly-governed platform for managing blood donation requests across multiple camps, connecting critical patients with verified donors.

## Architecture & Tech Stack

This project strictly adheres to a completely serverless, no-backend architecture using:
- **Frontend:** React 19, TypeScript, Vite, TailwindCSS (v4)
- **Database:** Firebase Realtime Database (RTDB)
- **Authentication:** Firebase Authentication
- **Storage:** Cloudinary API (replaces Firebase Storage per Deviation D-003, removing the Blaze plan requirement)
- **Hosting:** Firebase Hosting
- **Reporting:** Client-side only using SheetJS (`xlsx`) and `jsPDF`.

## Governance Philosophy (OGE)

This project was engineered following the **OGE (Observability, Guardrails, Evaluation)** paradigm. We do not assume happy paths. We assume structural failures and enforce boundaries at the lowest possible layer (the database rules matrix).

For full details on this approach and a timeline of the structural vulnerabilities we discovered and resolved during this build, read the [DESIGN.md](./DESIGN.md) document.

### The 8 Governance Documents
This build is strictly governed by a suite of documents that evolved over the 5-day build.
1. [CAP-23_FDD.md](./CAP-23_FDD.md)
2. [CAP-23_TDD.md](./CAP-23_TDD.md)
3. [CAP-23_DB_Design.md](./CAP-23_DB_Design.md)
4. [CAP-23_UI_Specs.md](./CAP-23_UI_Specs.md)
5. [CAP-23_Test_Plan.md](./CAP-23_Test_Plan.md)
6. [CAP-23_Deviation_Log.md](./CAP-23_Deviation_Log.md)
7. [CAP-23_Implementation_Decisions_Log.md](./CAP-23_Implementation_Decisions_Log.md)
8. **Day Build Prompts** (Chronological specs guiding the build)

## Setup Instructions

### 1. Environment Variables
Create a `.env` file in the root directory and populate it with your Firebase configuration and Cloudinary preset:
```env
VITE_FIREBASE_API_KEY="your-api-key"
VITE_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
VITE_FIREBASE_DATABASE_URL="https://your-project.firebasedatabase.app"
VITE_FIREBASE_PROJECT_ID="your-project"
VITE_FIREBASE_STORAGE_BUCKET="your-project.appspot.com"
VITE_FIREBASE_MESSAGING_SENDER_ID="your-sender-id"
VITE_FIREBASE_APP_ID="your-app-id"

# Cloudinary (Unauthenticated Uploads via Preset)
VITE_CLOUDINARY_CLOUD_NAME="your-cloud-name"
VITE_CLOUDINARY_UPLOAD_PRESET="your-preset"
```

### 2. Firebase Database Rules
Deploy the rigorous security rules established in this project.
```bash
firebase deploy --only database
```

### 3. Bootstrap the First Admin (One-Time Manual Step)
Because `Admin` is the highest role required to create other users, the very first Admin must be bootstrapped manually via the Firebase Console:
1. Sign up for an account via the UI (`admin@example.com`).
2. Go to the Firebase Realtime Database console.
3. Navigate to `/users/{your-uid}`.
4. Manually set `"role": "Admin"`.
5. You can now log into the UI and use the "Users" and "Masters" tabs to set up the rest of the system.

### 4. Running Locally
```bash
npm install
npm run dev
```

### 5. Deployment
```bash
npm run build
firebase deploy --only hosting
```
