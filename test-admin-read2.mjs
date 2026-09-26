import { initializeApp } from 'firebase/app';
import { getDatabase, ref, get, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

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
  
  // Use REST API to bypass security rules and set user to Admin
  const restUrl = `http://127.0.0.1:9000/users/${uid}.json?ns=cap23-blood-donation-default-rtdb`;
  await fetch(restUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role: 'Admin' })
  });

  const check = await fetch(restUrl);
  console.log("DB USER:", await check.json());

  try {
    const snap = await get(ref(db, 'audit_logs/donation_requests/test-id'));
    console.log("SUCCESS! Admin can read. Value:", snap.val());
  } catch (e) {
    console.error("DENIED! Error:", e.message);
  }
  process.exit(0);
}
runTest();
