// test-fefo-concurrency.mjs
// Milestone 2 Concurrency Test: Proves that parallel reservation attempts for stock units
// result in zero double-allocations and clean Mode B fallbacks.

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
  console.log('=== RUNNING MILESTONE 2 FEFO CONCURRENCY TEST ===');

  // 1. Authenticate actors
  const { token: storageToken } = await loginUser('storage1@example.com', 'password123');
  const { token: intakeToken } = await loginUser('intake_tech@example.com', 'password123');
  console.log('1. Storage actors authenticated.');

  // 2. Intake and certify exactly TWO rare units (B_minus Platelets)
  const uniqueGroup = 'B_minus';
  const uniqueComponent = 'Platelets';
  const unitIds = [];

  for (let i = 1; i <= 2; i++) {
    const barcode = `CONCUR-${Date.now()}-${i}`;
    const intake = await callFunction('intakeStorageUnit', intakeToken, {
      bagBarcode: barcode,
      bloodGroup: uniqueGroup,
      componentType: uniqueComponent,
      sourceType: 'Camp',
      storageLocation: `Platelet Agitator Shelf ${i}`
    });
    const uId = intake.unitId;

    await callFunction('certifyStorageUnit', storageToken, {
      unitId: uId,
      bagBarcode: barcode,
      labConfirmedBloodGroup: uniqueGroup,
      rhTyping: 'Negative',
      ttiLotNumbers: {
        hivLot: 'LOT-HIV',
        hbvLot: 'LOT-HBV',
        hcvLot: 'LOT-HCV',
        malariaLot: 'LOT-MAL',
        syphilisLot: 'LOT-SYP'
      },
      isReactive: false
    });
    unitIds.push(uId);
  }
  console.log(`2. Seeded exactly 2 certified units: ${unitIds.join(', ')}`);

  // 3. Launch 20 concurrent reservation calls competing for 1 unit each
  console.log('3. Launching 20 parallel reservation requests simultaneously...');
  const promises = [];
  for (let i = 1; i <= 20; i++) {
    const reqId = `REQ-RACE-${i}`;
    promises.push(
      callFunction('reserveStockUnits', storageToken, {
        requestId: reqId,
        recipientBloodGroupId: uniqueGroup,
        componentType: uniqueComponent,
        unitsNeeded: 1
      }).catch(err => ({ error: err.message }))
    );
  }

  const results = await Promise.all(promises);

  // 4. Verify outcomes
  const modeASuccesses = results.filter(r => r.success && r.mode === 'Mode_A');
  const modeBFallbacks = results.filter(r => !r.success && r.mode === 'Mode_B_Required');

  console.log(`   Mode A allocations achieved: ${modeASuccesses.length}`);
  console.log(`   Mode B fallback declarations: ${modeBFallbacks.length}`);

  assert.strictEqual(modeASuccesses.length, 2, 'Exactly 2 requests must succeed in Mode A (equal to available stock)');
  assert.strictEqual(modeBFallbacks.length, 18, 'Exactly 18 requests must cleanly fall back to Mode B');

  // 5. Verify zero double-allocation
  const allocatedUnitIds = modeASuccesses.map(r => r.reservedUnits[0].unitId);
  const uniqueAllocated = new Set(allocatedUnitIds);
  assert.strictEqual(uniqueAllocated.size, 2, 'Allocated unit IDs must be distinct (zero double allocation)');

  console.log('4. ✅ Zero double allocations verified: Each physical bag reserved by exactly one unique request.');
  console.log('======================================================');
  console.log('🏆 MILESTONE 2 ATOMIC CONCURRENCY PASSED WITH 100% PURITY!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
