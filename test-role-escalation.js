import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
connectDatabaseEmulator(db, '127.0.0.1', 9000);

const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function runTest() {
  console.log("Testing Role Escalation...");
  try {
    const userCred = await createUserWithEmailAndPassword(auth, `hacker${Date.now()}@example.com`, 'password123');
    const uid = userCred.user.uid;

    const userRef = ref(db, `users/${uid}`);
    
    // Attempting to write Admin role
    console.log("Attempting to self-register as Admin...");
    try {
      await set(userRef, {
        email: userCred.user.email,
        name: 'Hacker',
        role: 'Admin', // Illegal role escalation
        createdAt: new Date().toISOString()
      });
      console.error("FAIL: User was able to register as Admin!");
    } catch (error) {
      if (error.message.includes('Permission denied')) {
        console.log("SUCCESS: Rules correctly blocked Admin role escalation.");
      } else {
        console.error("Unexpected error on Admin:", error);
      }
    }

    // Attempting to write Manager role
    console.log("Attempting to self-register as Manager...");
    try {
      await set(userRef, {
        email: userCred.user.email,
        name: 'Hacker',
        role: 'Manager', // Illegal role escalation
        createdAt: new Date().toISOString()
      });
      console.error("FAIL: User was able to register as Manager!");
    } catch (error) {
      if (error.message.includes('Permission denied')) {
        console.log("SUCCESS: Rules correctly blocked Manager role escalation.");
      } else {
        console.error("Unexpected error on Manager:", error);
      }
    }

    // Attempting to write Donor role (which SHOULD succeed)
    console.log("Attempting to self-register as Donor...");
    try {
      await set(userRef, {
        email: userCred.user.email,
        name: 'Hacker',
        role: 'Donor', // Legal
        createdAt: new Date().toISOString()
      });
      console.log("SUCCESS: Rules correctly allowed user to register as Donor.");
    } catch (error) {
      console.error("FAIL: User was unable to register as Donor!", error);
    }

    process.exit(0);
  } catch (error) {
    console.error("Auth error:", error);
    process.exit(1);
  }
}

runTest();
