// test-anti-dos-sos-pledge.mjs
// Verifies Milestone 6:
// 1. Authorize Community SOS Appeal (Medical Officer Gate, 2h TTL 128-bit token)
// 2. Submit Public Volunteer Pledges with Anti-DoS Cap (3x unitsNeeded)
// 3. 7th pledge rejected once capacity is reached
// 4. Clinical Invariant: unitsNeeded is NEVER decremented by public volunteer pledges
// 5. Privacy: Volunteer phone number is securely masked in public storage

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
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ data })
  });
  const json = await res.json();
  if (json.error) {
    const err = new Error(json.error.message || JSON.stringify(json.error));
    err.status = json.error.status;
    err.details = json.error;
    throw err;
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
  console.log('=== RUNNING MILESTONE 6 COMMUNITY SOS APPEAL & ANTI-DOS TEST ===');

  const { token: adminToken } = await loginUser('admin@example.com', 'password123');

  const reqId = `REQ-SOS-${Date.now()}`;
  const campId = 'CAMP_CENTRAL';

  // Seed critical requisition needing 2 units
  await fetch(`${RTDB_URL}/transactions/donation_request/${campId}/${reqId}.json?ns=cap23-blood-donation-default-rtdb&auth=${adminToken}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestId: reqId,
      campId,
      recipientName: 'Emergency Trauma Patient',
      urgency: 'Critical',
      status: 'Registered',
      patientBloodGroup: 'B_minus',
      blood_groupId: 'B_minus',
      componentType: 'Platelets',
      unitsNeeded: 2,
      unitsCollected: 0
    })
  });

  console.log('[Step 1] Authorizing Community SOS Appeal...');
  const authRes = await callFunction('authorizeCommunitySOS', adminToken, {
    requestId: reqId
  });

  assert.strictEqual(authRes.success, true);
  assert(authRes.token, 'Must return 128-bit crypto token');
  assert(authRes.expiresAt > Date.now(), 'Must have valid future TTL');
  const token = authRes.token;
  console.log(`SOS Token generated: ${token.substring(0, 16)}...`);

  // Verify RTDB link record (sos_links is public read)
  const linkSnap = await fetch(`${RTDB_URL}/sos_links/${token}.json?ns=cap23-blood-donation-default-rtdb`).then(r => r.json());
  assert.strictEqual(linkSnap.unitsNeeded, 2);
  assert.strictEqual(linkSnap.active, true);

  console.log('[Step 2] Testing Anti-DoS Volunteer Pledges (Cap = 3 * 2 = 6)...');
  for (let i = 1; i <= 6; i++) {
    const pledgeRes = await callFunction('submitPublicVolunteerPledge', null, {
      token,
      volunteerName: `Walk-in Donor ${i}`,
      phone: `987654321${i}`,
      bloodGroup: 'B_minus'
    });
    assert.strictEqual(pledgeRes.success, true);
    assert.strictEqual(pledgeRes.pledgeNumber, i);
  }
  console.log('Successfully accepted 6 pledges (3x capacity limit).');

  console.log('[Step 3] Submitting 7th pledge (Must be rejected due to Anti-DoS Cap)...');
  let rejected = false;
  try {
    await callFunction('submitPublicVolunteerPledge', null, {
      token,
      volunteerName: 'Walk-in Donor 7',
      phone: '9876543217',
      bloodGroup: 'B_minus'
    });
  } catch (err) {
    rejected = true;
    console.log(`Expected rejection caught: ${err.message}`);
  }
  assert.strictEqual(rejected, true, '7th pledge must be rejected when capacity is saturated');

  console.log('[Step 4] Checking Invariant: unitsNeeded is strictly untouched...');
  const finalReqSnap = await fetch(`${RTDB_URL}/transactions/donation_request/${campId}/${reqId}.json?ns=cap23-blood-donation-default-rtdb&auth=${adminToken}`).then(r => r.json());
  assert.strictEqual(finalReqSnap.unitsNeeded, 2, 'unitsNeeded must NEVER be decremented by pledges');
  assert.strictEqual(finalReqSnap.unitsCollected, 0, 'unitsCollected must remain 0 until physical donation');

  console.log('[Step 5] Checking Privacy: Donor phone masking...');
  const volunteersSnap = await fetch(`${RTDB_URL}/public_volunteers/${reqId}.json?ns=cap23-blood-donation-default-rtdb&auth=${adminToken}`).then(r => r.json());
  const volunteers = Object.values(volunteersSnap || {});
  assert.strictEqual(volunteers.length, 6);
  assert(volunteers[0].phone.includes('*'), 'Phone number must be masked in database');
  console.log(`Verified masked phone: ${volunteers[0].phone}`);

  console.log('=== ALL MILESTONE 6 COMMUNITY SOS & ANTI-DOS CHECKS PASSED ===');
}

run().catch((err) => {
  console.error('Test Failed:', err);
  process.exit(1);
});
