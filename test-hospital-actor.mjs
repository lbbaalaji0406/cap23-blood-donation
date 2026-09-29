import { initializeApp as adminInit } from 'firebase-admin/app';
import { getDatabase as adminDb } from 'firebase-admin/database';
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions';
import { getDatabase, connectDatabaseEmulator, ref, get } from 'firebase/database';
import { readFileSync } from 'fs';
import * as functionsModule from './functions/lib/index.js';

console.log("=================================================");
console.log("HOSPITAL ACTOR & DUAL-INDEX VERIFICATION TEST SUITE");
console.log("(Real Cloud Functions Execution & Live Database Contract)");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${detail}`);
    failed++;
  }
}

// 1. Static Rules & Export Verification
const rawRules = readFileSync('./database.rules.json', 'utf8');
let parsedRules;
try {
  parsedRules = JSON.parse(rawRules);
  assert(true, 'database.rules.json is valid JSON');
} catch (e) {
  assert(false, 'database.rules.json is valid JSON', e.message);
}

const hospitalRules = parsedRules.rules?.hospital_requests;
assert(hospitalRules !== undefined, 'rules.hospital_requests node exists');
assert(hospitalRules?.$hospitalId?.[".write"] === "false", 'rules.hospital_requests.$hospitalId write is locked to false');
assert(
  hospitalRules?.$hospitalId?.[".read"]?.includes("auth.uid") &&
  hospitalRules?.$hospitalId?.[".read"]?.includes("hospitalId"),
  'rules.hospital_requests.$hospitalId read enforces hospitalId matching'
);

const donationReqLeafRules = parsedRules.rules?.transactions?.donation_request?.$campId?.$requestId;
assert(
  donationReqLeafRules?.[".read"]?.includes("Hospital") &&
  donationReqLeafRules?.[".read"]?.includes("recipientHospitalId"),
  'donation_request leaf node allows hospital to read only its own recipientHospitalId'
);

// Verify actual symbols exported from functions/lib/index.js
assert(typeof functionsModule.submitHospitalRequisition === 'function', 'submitHospitalRequisition Cloud Function is exported from functions/lib');
assert(typeof functionsModule.cancelHospitalRequisition === 'function', 'cancelHospitalRequisition Cloud Function is exported from functions/lib');
assert(typeof functionsModule.createUserByAdmin === 'function', 'createUserByAdmin Cloud Function is exported from functions/lib');
assert(typeof functionsModule.processWorkflowState === 'function', 'processWorkflowState Cloud Function is exported from functions/lib');

// 2. Setup Client App & Admin App for Live Verification
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const adminApp = adminInit({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
}, 'adminForHospitalTests_' + Date.now());
const db = adminDb(adminApp);

const clientApp = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
}, 'clientForHospitalTests_' + Date.now());
const auth = getAuth(clientApp);
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
const fns = getFunctions(clientApp);
connectFunctionsEmulator(fns, '127.0.0.1', 5001);

async function runLiveTests() {
  console.log("\n--- 2. Real Cloud Function Execution: submitHospitalRequisition ---");
  
  // Authenticate as Hospital Staff
  await signInWithEmailAndPassword(auth, 'hospital@example.com', 'password123');
  const submitFn = httpsCallable(fns, 'submitHospitalRequisition');

  const reqInput = {
    campId: 'CAMP001',
    recipientName: 'Ravi Kumar (Clinical Requisition)',
    patientId: 'IP-8821',
    blood_groupId: 'O_plus',
    componentType: 'Platelets',
    unitsNeeded: 2,
    urgency: 'Critical',
    notes: 'Dengue shock syndrome - urgent apheresis needed'
  };

  const submitResult = await submitFn(reqInput);
  const createdRequestId = submitResult.data.requestId;
  assert(Boolean(createdRequestId), 'submitHospitalRequisition returns created requestId', `ID: ${createdRequestId}`);

  // Inspect the actual database nodes created by the real Cloud Function
  const campQueueSnap = await db.ref(`transactions/donation_request/CAMP001/${createdRequestId}`).get();
  const hospQueueSnap = await db.ref(`hospital_requests/HOS001/${createdRequestId}`).get();

  assert(campQueueSnap.exists(), 'Camp queue record created in RTDB by real Cloud Function');
  assert(hospQueueSnap.exists(), 'Hospital queue record created in RTDB by real Cloud Function');

  const campData = campQueueSnap.val();
  const hospData = hospQueueSnap.val();

  assert(campData.recipientHospitalId === 'HOS001', 'Camp queue payload binds authenticated hospitalId HOS001');
  assert(hospData.recipientHospitalId === 'HOS001', 'Hospital queue payload binds authenticated hospitalId HOS001');
  assert(campData.status === 'Registered', 'Camp queue initial status is strictly Registered');
  assert(hospData.status === 'Registered', 'Hospital queue initial status is strictly Registered');
  assert(campData.unitsSecured === 0 && hospData.unitsSecured === 0, 'Initial unitsSecured is strictly 0 across both queues');
  assert(campData.componentType === 'Platelets', 'Platelet component properly captured in camp queue');
  assert(hospData.componentType === 'Platelets', 'Platelet component properly captured in hospital queue');
  assert(campData.patientId === 'IP-8821' && hospData.patientId === 'IP-8821', 'Patient IP/Bed number preserved across both queues');

  console.log("\n--- 3. Real Cloud Function Execution: processWorkflowState (Match Response Sync) ---");

  // Seed two donor matches for this request
  const donor1Uid = 'DONOR_LIVE_TEST_1';
  const donor2Uid = 'DONOR_LIVE_TEST_2';

  await db.ref(`matches/${createdRequestId}/${donor1Uid}`).set({
    donorUid: donor1Uid,
    status: 'pending_response',
    matchedAt: Date.now()
  });
  await db.ref(`matches/${createdRequestId}/${donor2Uid}`).set({
    donorUid: donor2Uid,
    status: 'pending_response',
    matchedAt: Date.now()
  });

  // Switch authentication to Camp Manager (CAMP001)
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'manager@example.com', 'password123');
  const workflowFn = httpsCallable(fns, 'processWorkflowState');

  // Donor 1 accepts -> Call real Cloud Function
  await workflowFn({
    action: 'RESPOND_TO_MATCH',
    campId: 'CAMP001',
    requestId: createdRequestId,
    donorUid: donor1Uid,
    response: 'accept'
  });

  // Read live database state
  const campSnapAfter1 = (await db.ref(`transactions/donation_request/CAMP001/${createdRequestId}`).get()).val();
  const hospSnapAfter1 = (await db.ref(`hospital_requests/HOS001/${createdRequestId}`).get()).val();

  assert(campSnapAfter1.unitsSecured === 1, 'Camp queue unitsSecured incremented to 1');
  assert(hospSnapAfter1.unitsSecured === 1, 'Hospital queue unitsSecured synchronized to 1');
  assert(campSnapAfter1.status === 'Partially Matched', 'Camp queue status transitioned to Partially Matched');
  assert(hospSnapAfter1.status === 'Partially Matched', 'Hospital queue status synchronized to Partially Matched');

  // Donor 2 accepts -> Call real Cloud Function
  await workflowFn({
    action: 'RESPOND_TO_MATCH',
    campId: 'CAMP001',
    requestId: createdRequestId,
    donorUid: donor2Uid,
    response: 'accept'
  });

  const campSnapAfter2 = (await db.ref(`transactions/donation_request/CAMP001/${createdRequestId}`).get()).val();
  const hospSnapAfter2 = (await db.ref(`hospital_requests/HOS001/${createdRequestId}`).get()).val();

  assert(campSnapAfter2.unitsSecured === 2, 'Camp queue unitsSecured reached 2 (target met)');
  assert(hospSnapAfter2.unitsSecured === 2, 'Hospital queue unitsSecured synchronized to 2');
  assert(campSnapAfter2.status === 'Matched', 'Camp queue status transitioned to Matched');
  assert(hospSnapAfter2.status === 'Matched', 'Hospital queue status synchronized to Matched');

  console.log("\n--- 4. Real Cloud Function Execution: cancelHospitalRequisition (Authorization & Constraints) ---");

  // Switch back to Hospital Staff
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'hospital@example.com', 'password123');
  const cancelFn = httpsCallable(fns, 'cancelHospitalRequisition');

  // 4.1: Attempt to cancel a requisition in 'Matched' status -> Must be REJECTED by real Cloud Function
  try {
    await cancelFn({
      campId: 'CAMP001',
      requestId: createdRequestId,
      reason: 'Patient improved'
    });
    assert(false, 'cancelHospitalRequisition on Matched request should have failed', 'Unexpectedly succeeded!');
  } catch (err) {
    const isPreconditionFailed = err.message.includes('failed-precondition') || err.message.includes('Cannot cancel requisition');
    assert(
      isPreconditionFailed,
      'Real Cloud Function REJECTS cancellation of Matched requisition',
      `Error received: ${err.message}`
    );
  }

  // 4.2: Create a second Hospital user belonging to HOS002 to test cross-hospital cancellation
  const rivalHospitalUid = 'RIVAL_HOSPITAL_USER_UID';
  await db.ref(`users/${rivalHospitalUid}`).set({
    email: 'rival@apollo.org',
    name: 'Dr. Rival',
    role: 'Hospital',
    hospitalId: 'HOS002',
    accountStatus: 'active'
  });

  // Submit a fresh 'Registered' requisition to test legal cancellation and cross-cancellation
  const req2Result = await submitFn({
    campId: 'CAMP001',
    recipientName: 'Anita Roy',
    patientId: 'IP-9002',
    blood_groupId: 'A_plus',
    componentType: 'WholeBlood',
    unitsNeeded: 1,
    urgency: 'Routine',
    notes: 'Pre-surgery reserve'
  });
  const req2Id = req2Result.data.requestId;

  // 4.3: Cross-hospital cancellation attempt
  // Create rival auth account in emulator if not existing
  const { getAuth: adminGetAuth } = await import('firebase-admin/auth');
  const authAdmin = adminGetAuth(adminApp);
  try {
    await authAdmin.createUser({ uid: rivalHospitalUid, email: 'rival@apollo.org', password: 'password123' });
  } catch (e) {
    // Already created
  }

  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'rival@apollo.org', 'password123');

  try {
    await cancelFn({
      campId: 'CAMP001',
      requestId: req2Id,
      reason: 'Malicious cancellation by rival hospital'
    });
    assert(false, 'Cross-hospital cancellation should have been REJECTED', 'Unexpectedly succeeded!');
  } catch (err) {
    const isPermissionDenied = err.message.includes('permission-denied') || err.message.includes('permission to cancel');
    assert(
      isPermissionDenied,
      'Real Cloud Function REJECTS cross-hospital cancellation (HOS002 cannot cancel HOS001 requisition)',
      `Error received: ${err.message}`
    );
  }

  // 4.4: Legitimate cancellation by owning hospital
  await signOut(auth);
  await signInWithEmailAndPassword(auth, 'hospital@example.com', 'password123');

  const cancelResult = await cancelFn({
    campId: 'CAMP001',
    requestId: req2Id,
    reason: 'Patient surgery rescheduled'
  });
  assert(cancelResult.data.success === true, 'cancelHospitalRequisition succeeded for owning hospital in Registered status');

  const req2CampSnap = (await db.ref(`transactions/donation_request/CAMP001/${req2Id}`).get()).val();
  const req2HospSnap = (await db.ref(`hospital_requests/HOS001/${req2Id}`).get()).val();

  assert(req2CampSnap.status === 'Closed', 'Camp queue status updated to Closed by real Cloud Function');
  assert(req2HospSnap.status === 'Closed', 'Hospital queue status updated to Closed by real Cloud Function');
  assert(req2CampSnap.cancellationReason === 'Patient surgery rescheduled', 'Camp queue contains real cancellationReason');
  assert(req2HospSnap.cancellationReason === 'Patient surgery rescheduled', 'Hospital queue contains real cancellationReason');

  console.log("\n=================================================");
  console.log(`REAL INTEGRATION TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");

  process.exit(failed > 0 ? 1 : 0);
}

runLiveTests().catch(err => {
  console.error("Test execution encountered an error:", err);
  process.exit(1);
});
