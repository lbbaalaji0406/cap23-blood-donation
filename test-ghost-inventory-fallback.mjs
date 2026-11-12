// test-ghost-inventory-fallback.mjs
// Verifies:
// 1. Unit reserved on shelf
// 2. Scan timeout triggers transition to ISSUE_UNCONFIRMED (Mode B activated)
// 3. Late scan recovery accepted with lateScan: true
// 4. Reconciliation desk restores verified unit to Certified shelf

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
  console.log('=== RUNNING MILESTONE 2 GHOST INVENTORY & TIMEOUT TEST ===');

  const { token: storageToken } = await loginUser('storage1@example.com', 'password123');
  const { token: intakeToken } = await loginUser('intake_tech@example.com', 'password123');
  const { token: adminToken } = await loginUser('admin@example.com', 'password123');

  // 1. Intake and certify unit
  const barcode = `GHOST-${Date.now()}`;
  const intake = await callFunction('intakeStorageUnit', intakeToken, {
    bagBarcode: barcode,
    bloodGroup: 'AB_minus',
    componentType: 'WholeBlood',
    sourceType: 'Camp',
    storageLocation: 'Shelf Ghost Test'
  });
  const unitId = intake.unitId;

  await callFunction('certifyStorageUnit', storageToken, {
    unitId,
    bagBarcode: barcode,
    labConfirmedBloodGroup: 'AB_minus',
    rhTyping: 'Negative',
    ttiLotNumbers: {
      hivLot: 'LOT-GHOST',
      hbvLot: 'LOT-GHOST',
      hcvLot: 'LOT-GHOST',
      malariaLot: 'LOT-GHOST',
      syphilisLot: 'LOT-GHOST'
    },
    isReactive: false
  });
  console.log(`1. Certified unit ${barcode} (${unitId}) on FEFO shelf.`);

  // 2. Reserve unit under Mode A (using dynamic request ID to prevent collisions)
  const ghostReqId = `REQ-GHOST-${Date.now()}`;
  const reserve = await callFunction('reserveStockUnits', storageToken, {
    requestId: ghostReqId,
    recipientBloodGroupId: 'AB_minus',
    componentType: 'WholeBlood',
    unitsNeeded: 1
  });
  assert.strictEqual(reserve.mode, 'Mode_A', 'Unit must be reserved under Mode A');
  const targetReservedUnitId = reserve.reservedUnits?.[0]?.unitId || unitId;
  console.log(`2. Unit ${barcode} (${targetReservedUnitId}) reserved with 10m physical scan deadline.`);

  // 3. Trigger watchdog sweep with simulated 15-minute time advancement
  console.log('3. Triggering watchdog sweep with simulated 15m time advancement...');
  const sweep = await callFunction('sweepScanTimeouts', storageToken, {
    simulatedNow: Date.now() + 15 * 60 * 1000
  });
  assert.ok(sweep.processedCount >= 1, 'At least 1 expired unit must be swept');
  console.log(`4. Watchdog sweep transitioned ${sweep.processedCount} units to ISSUE_UNCONFIRMED.`);

  // 5. Verify unit in RTDB is ISSUE_UNCONFIRMED
  const uSnap = await (await fetch(`${RTDB_URL}/inventory/units/${targetReservedUnitId}.json?auth=${adminToken}&ns=cap23-blood-donation-default-rtdb`)).json();
  assert.strictEqual(uSnap.status, 'ISSUE_UNCONFIRMED', 'Unit must be in ISSUE_UNCONFIRMED quarantine state');
  console.log('5. ✅ Ghost Inventory Guard verified: Un-scanned unit locked into quarantine.');

  // 6. Test Late-Scan Recovery: Warehouse finds bag and scans it
  console.log('6. Testing late scan recovery at dispatch dock...');
  const lateDispatch = await callFunction('confirmBarcodeDispatch', storageToken, {
    unitId: targetReservedUnitId,
    bagBarcode: uSnap.bagBarcode || barcode,
    hospitalId: 'HOS001'
  });

  assert.ok(lateDispatch.success, 'Late scan dispatch must succeed');
  assert.strictEqual(lateDispatch.lateScan, true, 'lateScan must be true');
  console.log('7. ✅ Late Scan Accepted: Unit safely dispatched with lateScan flag!');

  // 7. Verify Reconciliation Desk on a second unconfirmed unit
  const barcode2 = `RECON-${Date.now()}`;
  const intake2 = await callFunction('intakeStorageUnit', intakeToken, {
    bagBarcode: barcode2,
    bloodGroup: 'AB_minus',
    componentType: 'Platelets',
    sourceType: 'Camp',
    storageLocation: 'Shelf Recon Test'
  });
  const unitId2 = intake2.unitId;

  await callFunction('certifyStorageUnit', storageToken, {
    unitId: unitId2,
    bagBarcode: barcode2,
    labConfirmedBloodGroup: 'AB_minus',
    rhTyping: 'Negative',
    ttiLotNumbers: {
      hivLot: 'LOT-R',
      hbvLot: 'LOT-R',
      hcvLot: 'LOT-R',
      malariaLot: 'LOT-R',
      syphilisLot: 'LOT-R'
    },
    isReactive: false
  });

  const reconReqId = `REQ-RECON-${Date.now()}`;
  const reserve2 = await callFunction('reserveStockUnits', storageToken, {
    requestId: reconReqId,
    recipientBloodGroupId: 'AB_minus',
    componentType: 'Platelets',
    unitsNeeded: 1
  });
  const targetReconUnitId = reserve2.reservedUnits?.[0]?.unitId || unitId2;

  // Advance time past deadline and sweep
  await callFunction('sweepScanTimeouts', storageToken, {
    simulatedNow: Date.now() + 15 * 60 * 1000
  });

  // Reconcile back to Certified
  console.log('8. Reconciling unconfirmed bag after physical walk-in chiller check...');
  const recon = await callFunction('reconcileUnconfirmedUnit', storageToken, {
    unitId: targetReconUnitId,
    physicalCheckPassed: true,
    reason: 'Bag verified resting in chiller with temp 4.2°C intact'
  });

  assert.strictEqual(recon.status, 'Certified', 'Reconciled unit must return to Certified');
  console.log('9. ✅ Storage Reconciliation Desk passed: Unit returned to Certified FEFO active shelf.');

  console.log('======================================================');
  console.log('🏆 MILESTONE 2 GHOST INVENTORY & TIMEOUT SUITE PASSED!');
  console.log('======================================================');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
