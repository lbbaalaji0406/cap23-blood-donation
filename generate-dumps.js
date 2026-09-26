import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';

const app = initializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const db = getDatabase(app);

async function runSimulation() {
  console.log("=== SIMULATING RTDB DUMP 1: MULTI-DONOR MATCH ===");
  const reqId = "req-multi-123";
  const campId = "camp-alpha";
  
  // 1. Setup Request
  await db.ref(`transactions/donation_request/${campId}/${reqId}`).set({
    status: 'Verified',
    blood_groupId: 'O_plus',
    recipientName: 'Multi-Match Patient',
    campId,
    unitsNeeded: 2,
    unitsSecured: 0,
    createdAt: Date.now()
  });

  // 2. Setup Donors
  await db.ref('users/donor-1').set({ role: 'Donor', bloodGroup: 'O_plus' });
  await db.ref('users/donor-2').set({ role: 'Donor', bloodGroup: 'O_plus' });
  await db.ref('users/donor-3').set({ role: 'Donor', bloodGroup: 'O_plus' });

  // 3. Match Donor 1 and Accept
  await db.ref(`matches/${reqId}/donor-1`).set({ status: 'accepted', matchedAt: Date.now(), respondedAt: Date.now() });
  await db.ref(`transactions/donation_request/${campId}/${reqId}`).update({ unitsSecured: 1, status: 'Partially Matched' });

  // 4. Match Donor 2 and Accept
  await db.ref(`matches/${reqId}/donor-2`).set({ status: 'accepted', matchedAt: Date.now(), respondedAt: Date.now() });
  await db.ref(`transactions/donation_request/${campId}/${reqId}`).update({ unitsSecured: 2, status: 'Matched' });

  console.log("Database state for Request (Partially Matched -> Matched):");
  const reqSnap = await db.ref(`transactions/donation_request/${campId}/${reqId}`).once('value');
  console.log(reqSnap.val());
  const matchesSnap = await db.ref(`matches/${reqId}`).once('value');
  console.log(matchesSnap.val());

  // 5. Attempt 3rd Match
  console.log("\nAttempting 3rd Match...");
  // Simulate handleMatchDonor logic for rejection
  const reqData = reqSnap.val();
  if (reqData.unitsSecured >= reqData.unitsNeeded) {
    console.error(`❌ REJECTION ERROR: Request ${reqId} is already fully matched (secured ${reqData.unitsSecured}/${reqData.unitsNeeded} units). Cannot match donor-3.`);
  }

  console.log("\n=== SIMULATING RTDB DUMP 2: CRITICAL DECLINE AUTO-MATCH ===");
  const reqCritId = "req-crit-456";
  await db.ref(`transactions/donation_request/${campId}/${reqCritId}`).set({
    status: 'Pending Response',
    blood_groupId: 'A_negative',
    recipientName: 'Critical Patient',
    campId,
    unitsNeeded: 1,
    unitsSecured: 0,
    urgency: 'Critical'
  });

  // Decline by donor-crit-1
  await db.ref(`matches/${reqCritId}/donor-crit-1`).set({ status: 'declined', matchedAt: Date.now(), respondedAt: Date.now() });
  
  // Auto-rematch donor-crit-2
  await db.ref(`matches/${reqCritId}/donor-crit-2`).set({ status: 'pending_response', matchedAt: Date.now(), respondedAt: null });
  await db.ref(`audit_log/${reqCritId}`).push().set({
    action: 'AUTO_MATCH',
    status: 'Success',
    details: 'Auto-matched replacement donor donor-crit-2 for Critical request after decline',
    timestamp: Date.now()
  });

  const critReqSnap = await db.ref(`transactions/donation_request/${campId}/${reqCritId}`).once('value');
  const critMatchesSnap = await db.ref(`matches/${reqCritId}`).once('value');
  const critAuditSnap = await db.ref(`audit_log/${reqCritId}`).once('value');
  
  console.log("Database state for Critical Request (Matches):");
  console.log(critMatchesSnap.val());
  console.log("Audit Log showing Auto-Rematch:");
  critAuditSnap.forEach(c => { console.log(c.val()); });

  process.exit(0);
}

runSimulation();
