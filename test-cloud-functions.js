import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, connectAuthEmulator } from "firebase/auth";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { getDatabase, ref, get, connectDatabaseEmulator } from "firebase/database";
import fetch from "node-fetch";
import { initializeApp as adminInit } from 'firebase-admin/app';
import { getDatabase as adminDb } from 'firebase-admin/database';
import { getAuth as adminAuth } from 'firebase-admin/auth';

// Setup global fetch for Firebase auth emulator
global.fetch = fetch;

const firebaseConfig = {
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);
const functions = getFunctions(app);

// Connect to Emulators
connectAuthEmulator(auth, "http://127.0.0.1:9099");
connectDatabaseEmulator(db, "127.0.0.1", 9000);
connectFunctionsEmulator(functions, "127.0.0.1", 5001);

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const adminApp = adminInit({ projectId: "cap23-blood-donation", databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb" });
const adb = adminDb(adminApp);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log("=== RUNNING REAL CLOUD FUNCTION TESTS ===");
  
  try {
    // 0. Seed Database via Admin SDK
    console.log("Seeding database state...");
    const campId = "fakeCamp";
    const requestId = "fakeReqId";
    
    // Seed fully matched request
    await adb.ref(`transactions/donation_request/${campId}/${requestId}`).set({
      status: 'Matched',
      blood_groupId: 'O_plus',
      unitsNeeded: 2,
      unitsSecured: 2,
      campId
    });
    // Seed 2 accepted donors for it
    await adb.ref(`matches/${requestId}/donor1`).set({ status: 'accepted' });
    await adb.ref(`matches/${requestId}/donor2`).set({ status: 'accepted' });

    // Seed Critical request
    const critReqId = "critReq123";
    await adb.ref(`transactions/donation_request/${campId}/${critReqId}`).set({
      status: 'Pending Response',
      blood_groupId: 'A_negative',
      unitsNeeded: 1,
      unitsSecured: 0,
      urgency: 'Critical',
      campId
    });
    // Seed eligible replacement donor for the critical request
    await adb.ref(`users/donor-crit-2`).set({
      role: 'Donor',
      bloodGroup: 'A_negative'
    });
    // Seed the first donor who is pending
    await adb.ref(`matches/${critReqId}/donor-crit-1`).set({
      status: 'pending_response',
      matchedAt: Date.now()
    });
    // Set lock
    await adb.ref(`active_donor_matches/donor-crit-1`).set({
      requestId: critReqId,
      campId: campId
    });

    // Authenticate as Admin
    console.log("Creating/Logging in as Admin/Coordinator...");
    try {
      await adminAuth(adminApp).createUser({
        uid: "admin-ui-tester",
        email: "admin-ui-tester@example.com",
        password: "password123"
      });
      // also seed user profile
      await adb.ref('users/admin-ui-tester').set({
         role: 'Admin',
         name: 'UI Tester Admin'
      });
    } catch(e) { 
      /* ignore if exists */ 
    }
    await signInWithEmailAndPassword(auth, "admin-ui-tester@example.com", "password123");
    console.log("Authenticated successfully as " + auth.currentUser.uid);

    const processWorkflowState = httpsCallable(functions, "processWorkflowState");

    // 1. Simulate 3rd match rejection
    console.log("\n--- SCENARIO 1: Over-Fulfillment Rejection ---");
    console.log("Attempting to MATCH a 3rd donor when request is full...");
    try {
      const matchResult = await processWorkflowState({
        action: "MATCH_DONOR",
        campId: campId,
        requestId: requestId,
        donorUid: "donor-extra"
      });
      console.log("Result:", matchResult.data);
    } catch (e) {
      console.error("❌ CLOUD FUNCTION REJECTED MATCH:");
      console.error(e.message);
    }

    // 2. Critical Request Auto-Rematch
    console.log("\n--- SCENARIO 2: Critical Request Auto-Rematch ---");
    
    console.log("Sending RESPOND_TO_MATCH (decline) for Critical request...");
    try {
      const declineResult = await processWorkflowState({
        action: "RESPOND_TO_MATCH",
        campId: campId,
        requestId: critReqId,
        donorUid: "donor-crit-1",
        response: "decline"
      });
      console.log("Decline Result:", declineResult.data);

      console.log("Waiting 2 seconds for backend auto-match to complete...");
      await sleep(2000);

      console.log("Fetching real DB state for matches and audit log:");
      const matchesSnap = await get(ref(db, `matches/${critReqId}`));
      console.log("Matches node:", matchesSnap.val());

      const auditSnap = await get(ref(db, `audit_log/${critReqId}`));
      const logs = [];
      auditSnap.forEach(c => { logs.push(c.val()); });
      console.log("Audit Logs:", logs);

    } catch (e) {
      console.error("Error during decline:", e);
    }

    process.exit(0);
  } catch (error) {
    console.error("Test execution failed:", error);
    process.exit(1);
  }
}

runTests();
