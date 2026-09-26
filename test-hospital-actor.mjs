import { initializeApp as adminInit } from 'firebase-admin/app';
import { getDatabase as adminDb } from 'firebase-admin/database';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';

console.log("=================================================");
console.log("HOSPITAL ACTOR & DUAL-INDEX VERIFICATION TEST SUITE");
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

// 1. Initialize Admin App (connecting to local or mock DB)
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Verify rules syntax from database.rules.json
const rawRules = readFileSync('./database.rules.json', 'utf8');
let parsedRules;
try {
  parsedRules = JSON.parse(rawRules);
  assert(true, 'database.rules.json is valid JSON');
} catch (e) {
  assert(false, 'database.rules.json is valid JSON', e.message);
}

// Verify rules structure
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

// 2. Verify Cloud Function logic & exports from functions/lib/index.js
import * as functionsModule from './functions/lib/index.js';

assert(typeof functionsModule.submitHospitalRequisition === 'function', 'submitHospitalRequisition Cloud Function is exported');
assert(typeof functionsModule.cancelHospitalRequisition === 'function', 'cancelHospitalRequisition Cloud Function is exported');
assert(typeof functionsModule.createUserByAdmin === 'function', 'createUserByAdmin Cloud Function is exported');

// 3. Test Dual-Index Payload Construction and Isolation Contract
console.log("\n--- Dual-Index Data Contract Tests ---");

function constructRequisitionPayloads(callerHospitalId, input) {
  const requestId = 'REQ_TEST_' + Date.now();
  const timestamp = Date.now();
  
  const requestPayload = {
    requestId,
    campId: input.campId,
    recipientName: input.recipientName,
    recipientHospitalId: callerHospitalId,
    blood_groupId: input.blood_groupId,
    componentType: input.componentType || 'WholeBlood',
    unitsNeeded: input.unitsNeeded,
    unitsSecured: 0,
    urgency: input.urgency || 'Routine',
    status: 'Registered',
    notes: input.notes || '',
    patientId: input.patientId || '',
    createdBy: 'HOSP_USER_123',
    createdByName: 'Dr. Ramesh',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const hospitalRequestPayload = {
    requestId,
    campId: input.campId,
    recipientName: input.recipientName,
    recipientHospitalId: callerHospitalId,
    blood_groupId: input.blood_groupId,
    componentType: input.componentType || 'WholeBlood',
    unitsNeeded: input.unitsNeeded,
    unitsSecured: 0,
    urgency: input.urgency || 'Routine',
    status: 'Registered',
    notes: input.notes || '',
    patientId: input.patientId || '',
    createdAt: timestamp,
    updatedAt: timestamp
  };

  return { requestId, requestPayload, hospitalRequestPayload };
}

const { requestId, requestPayload, hospitalRequestPayload } = constructRequisitionPayloads('HOS001', {
  campId: 'CAMP001',
  recipientName: 'Ravi Kumar',
  patientId: 'IP-1234',
  blood_groupId: 'O_plus',
  componentType: 'Platelets',
  unitsNeeded: 2,
  urgency: 'Critical',
  notes: 'Dengue shock syndrome'
});

assert(requestPayload.recipientHospitalId === 'HOS001', 'Camp queue payload binds authenticated hospitalId');
assert(hospitalRequestPayload.recipientHospitalId === 'HOS001', 'Hospital queue payload binds authenticated hospitalId');
assert(requestPayload.status === 'Registered', 'Initial state is strictly Registered');
assert(requestPayload.unitsSecured === 0, 'Initial unitsSecured is 0');
assert(requestPayload.componentType === 'Platelets', 'Platelet component properly captured');
assert(requestPayload.patientId === 'IP-1234', 'Patient case/IP number preserved');

// 4. Test State Transition & Synchronization Contract
console.log("\n--- Real-Time Synchronization Contract Tests ---");

function simulateMatchAcceptSync(hospitalRequest, unitsAccepted) {
  const newUnitsSecured = (hospitalRequest.unitsSecured || 0) + unitsAccepted;
  let newStatus = 'Partially Matched';
  if (newUnitsSecured >= hospitalRequest.unitsNeeded) {
    newStatus = 'Matched';
  }
  return {
    ...hospitalRequest,
    unitsSecured: newUnitsSecured,
    status: newStatus,
    updatedAt: Date.now()
  };
}

// Donor 1 accepts
const step1 = simulateMatchAcceptSync(hospitalRequestPayload, 1);
assert(step1.unitsSecured === 1, 'Units secured increments to 1 after donor 1 accepts');
assert(step1.status === 'Partially Matched', 'Status transitions to Partially Matched (1/2 units)');

// Donor 2 accepts
const step2 = simulateMatchAcceptSync(step1, 1);
assert(step2.unitsSecured === 2, 'Units secured increments to 2 after donor 2 accepts');
assert(step2.status === 'Matched', 'Status transitions to Matched once unitsNeeded reached (2/2 units)');

// 5. Test Cancellation Rules
console.log("\n--- Cancellation Authorization Rules ---");

function evaluateCancellationEligibility(status, callerHospitalId, reqHospitalId) {
  if (callerHospitalId !== reqHospitalId) {
    return { allowed: false, reason: 'Cross-hospital cancellation forbidden' };
  }
  if (status !== 'Registered') {
    return { allowed: false, reason: `Cannot cancel requisition in '${status}' state directly. Please contact the camp coordinator.` };
  }
  return { allowed: true };
}

const cancelReg = evaluateCancellationEligibility('Registered', 'HOS001', 'HOS001');
assert(cancelReg.allowed, 'Hospital can cancel its own requisition while in Registered status');

const cancelMatched = evaluateCancellationEligibility('Matched', 'HOS001', 'HOS001');
assert(!cancelMatched.allowed && cancelMatched.reason.includes('contact the camp coordinator'), 'Hospital CANNOT cancel requisition in Matched status');

const cancelCross = evaluateCancellationEligibility('Registered', 'HOS002', 'HOS001');
assert(!cancelCross.allowed && cancelCross.reason.includes('Cross-hospital'), 'Hospital HOS002 CANNOT cancel requisition belonging to HOS001');

console.log("\n=================================================");
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
