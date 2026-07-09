# CAP-23 · Blood Donation Management

This is a healthcare-domain capstone project for matching donors to recipients with verification and donation history tracking.
It enforces a strict role-based access control (RBAC) model and follows the OGE (Observability, Guardrails, Evaluation) principles.

## Architecture

- **Frontend:** React 19, React Router 7, TypeScript 6, Tailwind v4, Lucide React
- **Build Tool:** Vite (using the latest stable Vite with Rollup, per deviation approval due to Rolldown instability)
- **Backend:** Firebase v12 (Auth, Realtime Database, Hosting)
- **Storage:** Cloudinary (for Attachments)

## Governance & Deviations

This project adheres strictly to the provided governance templates (FDD, DB Design, UI Specs, TDD, Test Plan). Three approved deviations apply:
- **D-001:** Added `Unfulfilled` terminal workflow state.
- **D-002:** Manager accounts are strictly scoped to their assigned `campId`.
- **D-003:** Cloudinary replaces Firebase Storage for Attachments.

## Setup Instructions

1. Clone the repository.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Set up Firebase:
   - Create a project in the [Firebase Console](https://console.firebase.google.com/).
   - Enable **Authentication** (Email/Password), **Realtime Database**, **Storage**, and **Hosting**.
   - Copy the configuration object and create a `.env.local` file in the root directory:
     ```env
     VITE_FIREBASE_API_KEY=your_api_key
     VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain
     VITE_FIREBASE_DATABASE_URL=your_database_url
     VITE_FIREBASE_PROJECT_ID=your_project_id
     VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket
     VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
     VITE_FIREBASE_APP_ID=your_app_id
     ```
   - Connect your project using the Firebase CLI:
     ```bash
     firebase login
     firebase use --add
     ```
   - Deploy the security rules:
     ```bash
     firebase deploy --only database,storage
     ```

4. Run the development server:
   ```bash
   npm run dev
   ```

## Development Discipline

This repository uses a strict commit-per-component discipline.
