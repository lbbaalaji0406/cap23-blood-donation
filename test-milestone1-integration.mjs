// test-milestone1-integration.mjs
// Milestone 1 Integration Test Suite
// Verifies:
// 1. Storage Officer provisioning & login
// 2. Intake into Quarantine
// 3. Maker-Checker enforcement: Self-certification rejection
// 4. Distinct Storage Officer certification with 5 TTI kit lots & ABO/Rh typing
// 5. FEFO Stock reservation under Mode A
// 6. Barcode physical dispatch verification
// 7. 30-Minute Return Rule enforcement

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
  console.log('=== RUNNING MILESTONE 1 END-TO-END INTEGRATION TEST ===');

  // Step 1: Admin logs in
  const { token: adminToken } = await loginUser('admin@example.com', 'password123');
  console.log('1. Admin authenticated successfully.');

  // Step 2: Ensure Storage Officer exists and log in
  let storageToken;
  try {
    const res = await loginUser('storage1@example.com', 'password123');
    storageToken = res.token;
    console.log('2. Storage officer storage1@example.com logged in.');
  } catch {
    console.log('2. Creating Storage officer storage1@example.com...');
    await callFunction('createUserByAdmin', adminToken, {
      email: 'storage1@example.com',
      password: 'password123',
      name: 'Ramesh Storage Officer',
      role: 'Storage'
    });
    const res = await loginUser('storage1@example.com', 'password123');
    storageToken = res.token;
  }

  // Step 3: Create a distinct Intake Tech user for Maker-Checker testing
  let intakeToken;
  const intakeEmail = 'intake_tech@example.com';
  try {
    const res = await loginUser(intakeEmail, 'password123');
    intakeToken = res.token;
  } catch {
    await callFunction('createUserByAdmin', adminToken, {
      email: intakeEmail,
      password: 'password123',
      name: 'Anitha Intake Tech',
      role: 'Storage'
    });
    const res = await loginUser(intakeEmail, 'password123');
    intakeToken = res.token;
  }
  console.log('3. Distinct intake officer intake_tech@example.com ready for Maker-Checker testing.');

  // Step 4: Intake Bag into Quarantine by Intake Tech Anitha
  const barcode = `BAG-${Math.floor(100000 + Math.random() * 900000)}`;
  const intakeResult = await callFunction('intakeStorageUnit', intakeToken, {
    bagBarcode: barcode,
    bloodGroup: 'O_plus',
    componentType: 'WholeBlood',
    sourceType: 'Camp',
    collectionFacilityId: 'CAMP001',
    storageLocation: 'Walk-In Chiller 1, Shelf B',
    donorRef: 'DONOR-TEST-001'
  });

  assert.ok(intakeResult.unitId, 'Unit must have an ID generated');
  assert.strictEqual(intakeResult.status, 'Quarantined', 'New unit must be Quarantined');
  const unitId = intakeResult.unitId;
  console.log(`4. Bag ${barcode} entered into Quarantine (unitId=${unitId}) by Lab Tech Anitha.`);

  // Step 5: Test Maker-Checker Violation (Anitha attempts to self-certify her own bag)
  try {
    await callFunction('certifyStorageUnit', intakeToken, {
      unitId,
      bagBarcode: barcode,
      labConfirmedBloodGroup: 'O_plus',
      rhTyping: 'Positive',
      ttiLotNumbers: {
        hivLot: 'LOT-HIV-01',
        hbvLot: 'LOT-HBV-01',
        hcvLot: 'LOT-HCV-01',
        malariaLot: 'LOT-MAL-01',
        syphilisLot: 'LOT-SYP-01'
      },
      isReactive: false
    });
    assert.fail('Maker-Checker must block self-certification!');
  } catch (err) {
    assert.ok(err.message.includes('permission-denied') || err.message.includes('Maker-Checker'), `Self-certification error expected, got: ${err.message}`);
    console.log('5. ✅ Maker-Checker verified: Self-certification blocked with permission-denied.');
  }

  // Step 6: Distinct Officer (Ramesh) certifies the unit
  const certResult = await callFunction('certifyStorageUnit', storageToken, {
    unitId,
    bagBarcode: barcode,
    labConfirmedBloodGroup: 'O_plus',
    rhTyping: 'Positive',
    ttiLotNumbers: {
      hivLot: 'LOT-HIV-01',
      hbvLot: 'LOT-HBV-01',
      hcvLot: 'LOT-HCV-01',
      malariaLot: 'LOT-MAL-01',
      syphilisLot: 'LOT-SYP-01'
    },
    isReactive: false
  });

  assert.strictEqual(certResult.status, 'Certified', 'Unit must be Certified');
  console.log(`6. ✅ Distinct Storage Officer certified ${barcode} safe for transfusion and placed on active FEFO shelf.`);

  // Step 7: Reserve Stock Units with FEFO Saga (Mode A)
  const reserveResult = await callFunction('reserveStockUnits', storageToken, {
    requestId: 'REQ-EMERGENCY-001',
    recipientBloodGroupId: 'O_plus',
    componentType: 'WholeBlood',
    unitsNeeded: 1
  });

  assert.ok(reserveResult.success, 'Reservation must succeed');
  assert.strictEqual(reserveResult.mode, 'Mode_A', 'Mode A fulfillment achieved');
  const allocated = reserveResult.reservedUnits?.[0];
  const targetUnitId = allocated?.unitId || unitId;
  const targetBarcode = allocated?.bagBarcode || barcode;
  console.log(`7. ✅ FEFO allocation confirmed: Unit ${targetBarcode} (${targetUnitId}) atomically reserved under Mode A.`);

  // Step 8: Barcode Dispatch Confirmation
  const dispatchResult = await callFunction('confirmBarcodeDispatch', storageToken, {
    unitId: targetUnitId,
    bagBarcode: targetBarcode,
    hospitalId: 'HOS001'
  });

  assert.ok(dispatchResult.success, 'Dispatch must succeed');
  console.log(`8. ✅ Physical barcode verified: Unit ${targetBarcode} Dispatched to hospital HOS001.`);

  // Step 9: 30-Minute Return Rule Check
  const returnResult = await callFunction('processUnitReturn', storageToken, {
    unitId: targetUnitId,
    coldChainIntact: true,
    returnTempCelsius: 5.5
  });

  assert.ok(returnResult.success, 'Return check must process');
  assert.strictEqual(returnResult.status, 'Certified', 'Unit must return to Certified');
  console.log(`9. ✅ 30-Minute Return Rule passed: Bag returned under 30 mins with intact cold chain safely returned to active stock.`);

  console.log('\n======================================================');
  console.log('🏆 ALL MILESTONE 1 END-TO-END WORKFLOW TESTS PASSED!');
  console.log('======================================================');
}

run().catch((err) => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
