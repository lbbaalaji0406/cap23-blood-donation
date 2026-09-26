import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation"
});
const db = getDatabase(app);
connectDatabaseEmulator(db, '127.0.0.1', 9000);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function seed() {
  const email = "admin@example.com";
  const password = "password123";
  let uid;
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCred.user.uid;
    console.log("Created auth user");
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      console.log("Admin user already exists in auth. Assuming UID is known...");
      // I can't easily get the UID without admin SDK, so I'll just use a fixed one or login to get it.
      const signIn = await import('firebase/auth').then(m => m.signInWithEmailAndPassword);
      const userCred = await signIn(auth, email, password);
      uid = userCred.user.uid;
    } else {
      console.error("Error seeding user:", e);
      process.exit(1);
    }
  }

  if (uid) {
    const restUrl = `http://127.0.0.1:9000/users/${uid}.json?ns=cap23-blood-donation-default-rtdb`;
    await fetch(restUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
      body: JSON.stringify({ email, name: "Admin User", role: 'Admin', createdAt: new Date().toISOString() })
    });
    console.log("Seeded Admin Profile Successfully!");
    process.exit(0);
  }
}
seed();
