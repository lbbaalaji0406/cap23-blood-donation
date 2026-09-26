import { initializeApp as adminInitializeApp } from 'firebase-admin/app';
import { getDatabase as adminGetDatabase } from 'firebase-admin/database';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";

const adminApp = adminInitializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const adminDb = adminGetDatabase(adminApp);

const app = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const db = getDatabase(app);
connectDatabaseEmulator(db, '127.0.0.1', 9000);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function runTest() {
  const email = `admin${Date.now()}@example.com`;
  const userCred = await createUserWithEmailAndPassword(auth, email, 'password123');
  const uid = userCred.user.uid;
  
  await adminDb.ref(`users/${uid}`).set({
    email,
    role: 'Admin'
  });

  const check = await adminDb.ref(`users/${uid}`).once('value');
  console.log("DB USER:", check.val());

  try {
    const snap = await get(ref(db, 'audit_logs/donation_requests/test-id'));
    console.log("SUCCESS! Admin can read. Value:", snap.val());
  } catch (e) {
    console.error("DENIED! Error:", e.message);
  }
  process.exit(0);
}
runTest();
