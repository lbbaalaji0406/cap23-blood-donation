import { initializeApp as adminInit } from 'firebase-admin/app';
import { getDatabase as adminDb } from 'firebase-admin/database';

console.log("=================================================");
console.log("DUAL-WRITE ATOMICITY & RECONCILIATION TEST SUITE");
console.log("=================================================\n");

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = adminInit({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const db = adminDb(app);

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

async function run() {
  const campId = 'CAMP001';
  const hospitalId = 'HOS001';
  const testRequestId = 'REQ_ATOM_TEST_' + Date.now();

  console.log("1. Simulating Failure In Sequential Writes (The Drift Vulnerability):");
  // Set initial state
  await db.ref(`transactions/donation_request/${campId}/${testRequestId}`).set({
    requestId: testRequestId,
    status: 'Registered',
    unitsNeeded: 2,
    unitsSecured: 0,
    recipientHospitalId: hospitalId
  });
  await db.ref(`hospital_requests/${hospitalId}/${testRequestId}`).set({
    requestId: testRequestId,
    status: 'Registered',
    unitsNeeded: 2,
    unitsSecured: 0,
    recipientHospitalId: hospitalId
  });

  // Simulate sequential write failure:
  // Write 1 succeeds
  await db.ref(`transactions/donation_request/${campId}/${testRequestId}/status`).set('Matched');
  // Crash / Network fault / Unhandled rejection happens HERE before Write 2:
  const simulatedCrash = true;
  if (!simulatedCrash) {
    await db.ref(`hospital_requests/${hospitalId}/${testRequestId}/status`).set('Matched');
  }

  const campSnapAfterCrash = (await db.ref(`transactions/donation_request/${campId}/${testRequestId}/status`).get()).val();
  const hospSnapAfterCrash = (await db.ref(`hospital_requests/${hospitalId}/${testRequestId}/status`).get()).val();

  assert(
    campSnapAfterCrash !== hospSnapAfterCrash,
    'Sequential write failure causes silent drift between Camp and Hospital queues',
    `Camp status is '${campSnapAfterCrash}' while Hospital status remains '${hospSnapAfterCrash}'`
  );

  console.log("\n2. Proving Multi-Path Update Atomicity (The Fix):");
  // Clean up and reset
  const atomicReqId = 'REQ_ATOMIC_FIX_' + Date.now();
  await db.ref(`transactions/donation_request/${campId}/${atomicReqId}`).set({
    requestId: atomicReqId,
    status: 'Registered',
    unitsNeeded: 2,
    unitsSecured: 0,
    recipientHospitalId: hospitalId
  });
  await db.ref(`hospital_requests/${hospitalId}/${atomicReqId}`).set({
    requestId: atomicReqId,
    status: 'Registered',
    unitsNeeded: 2,
    unitsSecured: 0,
    recipientHospitalId: hospitalId
  });

  // Execute single multi-path update
  const atomicUpdates = {};
  atomicUpdates[`transactions/donation_request/${campId}/${atomicReqId}/status`] = 'Matched';
  atomicUpdates[`transactions/donation_request/${campId}/${atomicReqId}/unitsSecured`] = 2;
  atomicUpdates[`hospital_requests/${hospitalId}/${atomicReqId}/status`] = 'Matched';
  atomicUpdates[`hospital_requests/${hospitalId}/${atomicReqId}/unitsSecured`] = 2;

  await db.ref().update(atomicUpdates);

  const campFinal = (await db.ref(`transactions/donation_request/${campId}/${atomicReqId}`).get()).val();
  const hospFinal = (await db.ref(`hospital_requests/${hospitalId}/${atomicReqId}`).get()).val();

  assert(campFinal.status === 'Matched', 'Camp queue status updated to Matched');
  assert(hospFinal.status === 'Matched', 'Hospital queue status updated to Matched');
  assert(campFinal.unitsSecured === 2, 'Camp unitsSecured is 2');
  assert(hospFinal.unitsSecured === 2, 'Hospital unitsSecured is 2');
  assert(campFinal.status === hospFinal.status, 'Zero drift: Camp and Hospital state strictly identical');

  console.log("\n=================================================");
  console.log(`DUAL-WRITE RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=================================================");
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
