import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, connectDatabaseEmulator, ref, set } from 'firebase/database';

const firebaseConfig = {
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');
const functions = getFunctions(app);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
const db = getDatabase(app);
connectDatabaseEmulator(db, '127.0.0.1', 9000);

async function runTest() {
  console.log("Testing Self-Signup Verification with potentially broken key...");
  try {
    const email = `selfsignup${Date.now()}@example.com`;
    const password = 'password123';

    // Simulate what the frontend does
    const userCred = await createUserWithEmailAndPassword(auth, email, password);
    const uid = userCred.user.uid;
    
    await set(ref(db, `users/${uid}`), {
      email: email,
      name: 'Self Signup User',
      role: 'Donor',
      bloodGroup: 'B_plus', // Add blood group
      createdAt: new Date().toISOString()
    });

    // Call requestSelfSignupVerification
    const requestSelfSignupVerification = httpsCallable(functions, 'requestSelfSignupVerification');
    
    console.log("Invoking requestSelfSignupVerification...");
    const res = await requestSelfSignupVerification();
    
    console.log("SUCCESS: requestSelfSignupVerification returned successfully without crashing.", res.data);
    
    // Now check RTDB for the created user
    const dbRes = await fetch(`http://127.0.0.1:9000/users/${uid}.json?ns=cap23-blood-donation`);
    const profile = await dbRes.json();
    console.log("RTDB Dump for signup with bloodGroup set:", JSON.stringify(profile));

    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}
runTest();
