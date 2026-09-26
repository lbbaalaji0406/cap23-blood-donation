import { initializeApp } from 'firebase/app';
import { getDatabase, ref, update, get, set } from 'firebase/database';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, connectAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});

const db = getDatabase(app);
const auth = getAuth(app);
const functions = getFunctions(app);
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function runTests() {
  console.log("Logging in as Admin...");
  await signInWithEmailAndPassword(auth, "admin@example.com", "password123");
  const processWorkflowState = httpsCallable(functions, 'processWorkflowState');

  const campId = "CAMP001";
  const requestId = "FAKE_REQ_123";
  const restUrl1 = `http://127.0.0.1:9000/transactions/donation_request/${campId}/${requestId}.json?ns=cap23-blood-donation-default-rtdb`;
  await fetch(restUrl1, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
    body: JSON.stringify({
      status: 'Matched',
      matchedDonorId: 'NON_EXISTENT_DONOR_999',
      blood_groupId: 'O_pos',
      recipientName: 'Test Patient',
      recipientHospitalId: 'HOS001'
    })
  });

  console.log("\n=== STEP 4: DONOR PROFILE FETCH FAILURE ===");
  console.log("Triggering UPDATE_STATUS to 'Donated' with a non-existent donor UID...");
  
  const res4 = await processWorkflowState({
    action: 'UPDATE_STATUS',
    campId,
    requestId,
    currentStatus: 'Matched',
    newStatus: 'Donated',
    donorUid: 'NON_EXISTENT_DONOR_999',
    volume: 1
  });
  
  console.log("Function response:", res4.data);

  // Wait a second for background email process to write to email_failures
  await new Promise(r => setTimeout(r, 1000));

  // Verify RTDB State
  const reqCheck = await get(ref(db, `transactions/donation_request/${campId}/${requestId}`));
  console.log("Actual Request Status in DB:", reqCheck.val().status); // Should be "Donated"

  // Verify email_failures
  const failuresSnap = await get(ref(db, 'email_failures'));
  const failures = failuresSnap.val() || {};
  const ourFailure = Object.values(failures).find(f => f.requestId === requestId);
  console.log("Email Failure Logged:", ourFailure ? ourFailure : "NONE (FAIL)");

  // --- STEP 5: RESEND API FAILURE ---
  // We need a real donor profile so Step A passes, but an invalid API key to fail Step C
  // Since we can't break the API key per-request easily, we can use a fake email that Resend rejects,
  // or we can mock it by passing a fake email that causes Resend to error (like missing @).
  
  console.log("\n=== STEP 5: RESEND API FAILURE ===");
  console.log("Setting up a donor with a malformed email to force Resend API to throw an error...");
  
  const badDonorUid = "BAD_EMAIL_DONOR";
  const restUrl = `http://127.0.0.1:9000/users/${badDonorUid}.json?ns=cap23-blood-donation-default-rtdb`;
  await fetch(restUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
    body: JSON.stringify({ email: "invalid-email-no-domain", name: "Bad Donor", role: 'Donor' })
  });

  const requestId2 = "FAKE_REQ_456";
  const restUrl2 = `http://127.0.0.1:9000/transactions/donation_request/${campId}/${requestId2}.json?ns=cap23-blood-donation-default-rtdb`;
  await fetch(restUrl2, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer owner' },
    body: JSON.stringify({
      status: 'Verified',
      blood_groupId: 'O_pos',
      recipientName: 'Test Patient 2',
      recipientHospitalId: 'HOS001'
    })
  });

  console.log("Triggering MATCH_DONOR...");
  const res5 = await processWorkflowState({
    action: 'MATCH_DONOR',
    campId,
    requestId: requestId2,
    donorUid: badDonorUid
  });

  console.log("Function response:", res5.data);

  await new Promise(r => setTimeout(r, 1000));

  // Verify RTDB State
  const reqCheck2 = await get(ref(db, `transactions/donation_request/${campId}/${requestId2}`));
  console.log("Actual Request Status in DB:", reqCheck2.val().status); // Should be "Matched"

  // Verify email_failures
  const failuresSnap2 = await get(ref(db, 'email_failures'));
  const failures2 = failuresSnap2.val() || {};
  const ourFailure2 = Object.values(failures2).find(f => f.requestId === requestId2);
  console.log("Email Failure Logged:", ourFailure2 ? ourFailure2 : "NONE (FAIL)");

  process.exit(0);
}

runTests();
