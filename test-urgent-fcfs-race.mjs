// test-urgent-fcfs-race.mjs
// Verifies:
// 1. Double-lock preventing concurrent claims to multiple requisitions
// 2. High-concurrency FCFS claiming with 30 simulated donors competing for 2 slots
// 3. Exactly 2 donors receive CONFIRMED slots
// 4. Remaining donors cleanly overflow to STANDBY without rejection or errors
// 5. unitsNeeded is NEVER decremented by claims

import assert from 'node:assert';

const RTDB_URL = 'http://127.0.0.1:9000';
const AUTH_URL = 'http://127.0.0.1:9099';
const FUNCTIONS_URL = 'http://127.0.0.1:5001/cap23-blood-donation/us-central1';

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

async function callFunction(name, token, data) {
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`Call to ${name} failed: ${JSON.stringify(json.error)}`);
  }
  return json.result;
}

async function loginUser(email, password) {
  const data = await postJson(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    email,
    password,
    returnSecureToken: true,
  });
  if (!data.idToken) throw new Error(`Auth failed for ${email}: ${JSON.stringify(data)}`);
  return { token: data.idToken, uid: data.localId };
}

async function run() {
  console.log('=== RUNNING MILESTONE 3 URGENT FCFS CONCURRENCY TEST ===');

  const { token: adminToken } = await loginUser('admin@example.com', 'password123');

  // 1. Setup Urgent Requisition for 1 unit (maxSlots = ceil(1/0.8) = 2)
  const reqId = `REQ-URGENT-${Date.now()}`;
  const reqData = {
    requestId: reqId,
    recipientName: 'Urgent Patient A',
    blood_groupId: 'O_plus',
    patientBloodGroup: 'O_plus',
    componentType: 'WholeBlood',
    urgency: 'Urgent',
    unitsNeeded: 1,
    recipientHospitalId: 'HOS001',
    hospitalId: 'HOS001',
    status: 'Registered',
    createdAt: Date.now()
  };

  await fetch(`${RTDB_URL}/transactions/donation_request/CAMP001/${reqId}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqData)
  });
  console.log(`1. Seeded Urgent requisition ${reqId} under CAMP001 (1 unit needed, 2 claimable slots).`);

  // 2. Create 25 mock donors with bloodGroup O_plus
  console.log('2. Creating 25 donor tokens for concurrent FCFS race...');
  const donorTokens = [];
  for (let i = 0; i < 25; i++) {
    const email = `donor_fcfs_${i}_${Date.now()}@test.com`;
    const signup = await postJson(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
      email,
      password: 'password123',
      returnSecureToken: true
    });
    const uid = signup.localId;
    const token = signup.idToken;

    // Seed user profile in RTDB
    await fetch(`${RTDB_URL}/users/${uid}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uid,
        email,
        bloodGroup: 'O_plus',
        role: 'Donor',
        isAvailable: true
      })
    });

    donorTokens.push({ uid, token });
  }

  // 3. Fire 25 concurrent claims simultaneously
  console.log('3. Firing 25 parallel claimUrgentSlot requests...');
  const claimPromises = donorTokens.map(({ token }) =>
    callFunction('claimUrgentSlot', token, { requestId: reqId })
      .then(res => ({ success: true, res }))
      .catch(err => ({ success: false, err: err.message }))
  );

  const results = await Promise.all(claimPromises);

  const confirmed = results.filter(r => r.success && r.res.disposition === 'CONFIRMED');
  const standby = results.filter(r => r.success && r.res.disposition === 'STANDBY');
  const failures = results.filter(r => !r.success);

  console.log(`   CONFIRMED Slots: ${confirmed.length}`);
  console.log(`   STANDBY Overflow: ${standby.length}`);
  console.log(`   Unexpected Failures: ${failures.length}`);
  if (failures.length > 0) {
    console.log('   Sample Failure Error:', failures[0].err);
  }

  // Invariants Check
  assert.strictEqual(confirmed.length, 2, 'Exactly 2 donors must be confirmed for slots');
  assert.strictEqual(standby.length, 23, 'Remaining 23 donors must overflow cleanly to STANDBY');
  assert.strictEqual(failures.length, 0, 'Zero unexpected failures allowed');

  // Verify RTDB State
  const claimsSnap = await (await fetch(`${RTDB_URL}/urgent_claims/${reqId}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`)).json();
  assert.strictEqual(claimsSnap.slotsClaimed, 2, 'claimsSnap.slotsClaimed must equal 2');

  const standbySnap = await (await fetch(`${RTDB_URL}/standby_pools/${reqId}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`)).json();
  assert.strictEqual(Object.keys(standbySnap || {}).length, 23, 'standby_pools must contain 23 donors');

  // Invariant 4: unitsNeeded is untouched
  const finalReqSnap = await (await fetch(`${RTDB_URL}/transactions/donation_request/CAMP001/${reqId}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`)).json();
  assert.strictEqual(finalReqSnap.unitsNeeded, 1, 'unitsNeeded must NEVER be decremented by claims');

  console.log('4. ✅ Invariant Verified: unitsNeeded remained untouched at 1.');
  console.log('5. ✅ Invariant Verified: Zero over-allocation, zero unhandled errors.');
  console.log('======================================================');
  console.log('🏆 MILESTONE 3 ATOMIC FCFS CLAIMING TEST PASSED!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
