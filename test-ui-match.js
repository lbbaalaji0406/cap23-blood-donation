import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import admin from "firebase-admin"; import { getDatabase as getAdminDb } from "firebase-admin/database"; import { getAuth as getAdminAuth } from "firebase-admin/auth";

// Initialize Admin to bypass rules and set up data
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
admin.initializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const adminDb = getAdminDb();

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
const clientDb = getDatabase(app);
connectDatabaseEmulator(clientDb, '127.0.0.1', 9000);

async function setupTestData() {
  // 1. Create a dummy request
  await adminDb.ref('transactions/donation_request/camp-1/req-123').set({
    status: 'Verified',
    blood_groupId: 'O_plus',
    recipientName: 'Test Patient',
    campId: 'camp-1',
    createdAt: Date.now(),
    unitsNeeded: 2,
    unitsSecured: 0
  });

  await adminDb.ref('users/donor-789').set({
    role: 'Donor',
    name: 'Eligible Donor',
    bloodGroup: 'O_plus'
  });
  
  // 2. We need a real Firebase Auth user so Cloud Functions verifies the token.
  let uid = 'admin-ui-tester';
  try {
    const userRecord = await getAdminAuth().createUser({
      uid: uid,
      email: "admin@test.com",
      password: "password123",
      displayName: "Admin Tester"
    });
  } catch (e) {
    if (e.code !== 'auth/uid-already-exists') throw e;
  }
  
  // 3. Set the role in the database
  await adminDb.ref(`users/${uid}`).set({
    role: 'Admin',
    name: 'Admin Tester'
  });
}

async function runTest() {
  console.log("Testing Legitimate UI Match via Cloud Function...");
  await setupTestData();
  try {
    await signInWithEmailAndPassword(auth, "admin@test.com", "password123");
    const processWorkflowState = httpsCallable(functions, 'processWorkflowState');
    console.log("Invoking processWorkflowState with MATCH_DONOR...");
    const result = await processWorkflowState({
      action: 'MATCH_DONOR',
      campId: 'camp-1',
      requestId: 'req-123',
      donorUid: 'donor-789'
    });
    console.log("Function completed. Result:", result.data);
    const lockSnapshot = await get(ref(clientDb, 'active_donor_matches/donor-789'));
    const matchSnapshot = await get(ref(clientDb, 'matches/req-123/donor-789'));
    if (lockSnapshot.exists() && matchSnapshot.exists() && matchSnapshot.val().status === 'pending_response') {
      console.log("✅ UI Match SUCCESSFUL. Lock acquired and matches subcollection entry created.");
      process.exit(0);
    } else {
      console.error("❌ UI Match FAILED. Lock or match entry missing.");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ UI Match FAILED. Function threw an error:", error);
    process.exit(1);
  }
}
runTest();
