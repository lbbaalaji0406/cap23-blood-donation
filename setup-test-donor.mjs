import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
});

const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function setup() {
  const email = process.argv[2];
  if (!email) {
    console.error("Please provide your Resend-verified email address as an argument.");
    console.error("Usage: node setup-test-donor.mjs <your-email>");
    process.exit(1);
  }

  const password = "password123";
  let uid;
  try {
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    uid = userCred.user.uid;
    console.log(`Created auth user for ${email} with UID: ${uid}`);
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      console.log(`User ${email} already exists in Auth. Proceeding to update profile...`);
      const signIn = await import('firebase/auth').then(m => m.signInWithEmailAndPassword);
      const userCred = await signIn(auth, email, password);
      uid = userCred.user.uid;
    } else {
      console.error("Error creating user:", e);
      process.exit(1);
    }
  }

  const restUrl = `http://127.0.0.1:9000/users/${uid}.json?ns=cap23-blood-donation-default-rtdb`;
  await fetch(restUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
    body: JSON.stringify({ 
      email, 
      name: "Test Donor", 
      role: 'Donor', 
      createdAt: new Date().toISOString() 
    })
  });

  console.log(`\n✅ Test Donor Profile seeded successfully!`);
  console.log(`UID: ${uid}`);
  console.log(`Email: ${email}`);
  console.log(`Role: Donor`);
  process.exit(0);
}

setup();
