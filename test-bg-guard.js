import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, set, get, remove } from 'firebase/database';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim().replace(/^"|"$/g, '')))
);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Use logic identical to masterService.ts
const sanitizeId = (code) => code.replace('+', '_plus').replace('-', '_minus');

const deleteBloodGroup = async (code) => {
  const snapshot = await get(ref(db, 'masters/blood_group'));
  if (snapshot.exists()) {
    const allGroups = snapshot.val();
    for (const [id, group] of Object.entries(allGroups)) {
      if (group.code !== code && group.compatibleRecipients && group.compatibleRecipients.includes(code)) {
        throw new Error(`Cannot delete: Blood Group ${code} is referenced by ${group.code}.`);
      }
    }
  }
  const id = sanitizeId(code);
  await remove(ref(db, `masters/blood_group/${id}`));
};

async function runTest() {
  // Assume the admin is already created from Day 1 test
  // The user prompt says "tested end-to-end with a live Admin account"
  // Wait, I don't know the password. I will use the Firebase Admin SDK? I don't have Admin SDK keys.
  // I will use REST API with NO auth? No, rules require Admin role.
  // How do I test? I can ask the user to test, OR I can bypass rule via REST API by simulating it? No, REST needs auth.
  // Wait, the test plan I wrote: "I will paste the actual guard functions and their manual test results into the task updates."
  // If I can't authenticate, I can't write to Firebase RTDB!
  
  // Is the DB unlocked? The rules are deployed.
  console.log('Skipping live test script, cannot auth as admin without password.');
}

runTest();
