// test-hospital-id-isolation.mjs
// Verifies AC-SEC-01: Proves a Hospital user cannot mutate their own hospitalId to break tenant boundaries,
// and proves legitimate updates succeed (positive controls).

const RTDB_URL = 'http://127.0.0.1:9000';
const AUTH_URL = 'http://127.0.0.1:9099';

async function postJson(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
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
  console.log('--- VERIFYING HARDENED HOSPITAL TENANT ISOLATION (AC-SEC-01) ---');

  // 1. Authenticate as Hospital 1 staff
  const { token, uid } = await loginUser('hospital1@example.com', 'password123');
  console.log(`1. Authenticated as Hospital 1 Staff (${uid})`);

  // Verify initial state
  const initialSnap = await (await fetch(`${RTDB_URL}/users/${uid}.json?auth=${token}&ns=cap23-blood-donation-default-rtdb`)).json();
  const originalHospitalId = initialSnap.hospitalId;
  console.log(`   Initial hospitalId in RTDB: "${originalHospitalId}"`);

  // 2. Exploit Attempt: Change hospitalId to HOS_RIVAL
  console.log('2. Attempting exploit: Mutating hospitalId from SRM to HOS_RIVAL...');
  const patchRes = await fetch(`${RTDB_URL}/users/${uid}.json?auth=${token}&ns=cap23-blood-donation-default-rtdb`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hospitalId: 'HOS_RIVAL' }),
  });

  if (patchRes.status === 401) {
    console.log('✅ EXPLOIT REJECTED: HTTP 401 Permission Denied returned by RTDB security rules!');
  } else {
    const body = await patchRes.json();
    if (body.error && body.error.toLowerCase().includes('permission_denied')) {
      console.log('✅ EXPLOIT REJECTED: RTDB returned Permission Denied on hospitalId mutation!');
    } else {
      console.error('❌ CRITICAL FAILURE: Hospital user successfully mutated hospitalId!', body);
      process.exit(1);
    }
  }

  // 3. Positive Control: Legitimate user update (e.g. updating name) MUST succeed
  console.log('3. Positive Control: Attempting legitimate name update for hospital staff...');
  const validPatch = await fetch(`${RTDB_URL}/users/${uid}.json?auth=${token}&ns=cap23-blood-donation-default-rtdb`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Dr. Anita (Verified)' }),
  });

  if (validPatch.ok) {
    console.log('✅ POSITIVE CONTROL PASSED: Legitimate profile fields can be updated!');
  } else {
    const errBody = await validPatch.json();
    console.error('❌ FAILURE: Legitimate profile edit failed!', errBody);
    process.exit(1);
  }

  // Verify hospitalId remained completely untouched
  const verifySnap = await (await fetch(`${RTDB_URL}/users/${uid}.json?auth=${token}&ns=cap23-blood-donation-default-rtdb`)).json();
  if (verifySnap.hospitalId === originalHospitalId) {
    console.log(`✅ TENANT STATE PRESERVED: Database hospitalId is still strictly "${originalHospitalId}"!`);
  } else {
    console.error(`❌ CRITICAL FAILURE: Database state changed to ${verifySnap.hospitalId}!`);
    process.exit(1);
  }

  // 4. Signup Exploit: Attempting to create account with self-assigned hospitalId
  console.log('4. Testing self-registration boundary: Attempting rogue signup with hospitalId...');
  const rogueEmail = `rogue_${Date.now()}@example.com`;
  const signupData = await postJson(`${AUTH_URL}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key`, {
    email: rogueEmail,
    password: 'password123',
    returnSecureToken: true,
  });

  if (!signupData.idToken) {
    throw new Error('Failed to create rogue test user in Auth emulator');
  }

  const rogueToken = signupData.idToken;
  const rogueUid = signupData.localId;

  const roguePut = await fetch(`${RTDB_URL}/users/${rogueUid}.json?auth=${rogueToken}&ns=cap23-blood-donation-default-rtdb`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: rogueEmail,
      role: 'Donor',
      hospitalId: 'HOS001', // Attacker trying to self-assign hospitalId
      createdAt: new Date().toISOString()
    }),
  });

  if (roguePut.status === 401) {
    console.log('✅ SIGNUP EXPLOIT REJECTED: HTTP 401 Permission Denied on self-assigned hospitalId!');
  } else {
    const putBody = await roguePut.json();
    if (putBody.error && putBody.error.toLowerCase().includes('permission_denied')) {
      console.log('✅ SIGNUP EXPLOIT REJECTED: RTDB returned Permission Denied for self-assigned hospitalId!');
    } else {
      console.error('❌ CRITICAL FAILURE: Rogue user self-assigned hospitalId on signup!', putBody);
      process.exit(1);
    }
  }

  // 5. Positive Control on Signup: Standard donor profile without hospitalId MUST succeed
  console.log('5. Positive Control: Legitimate donor profile signup...');
  const legitimatePut = await fetch(`${RTDB_URL}/users/${rogueUid}.json?auth=${rogueToken}&ns=cap23-blood-donation-default-rtdb`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: rogueEmail,
      role: 'Donor',
      name: 'Legitimate Voluntary Donor',
      createdAt: new Date().toISOString()
    }),
  });

  if (legitimatePut.ok) {
    console.log('✅ POSITIVE CONTROL PASSED: Legitimate voluntary donor profile successfully created!');
  } else {
    const legitErr = await legitimatePut.json();
    console.error('❌ FAILURE: Legitimate donor signup failed!', legitErr);
    process.exit(1);
  }

  console.log('===========================================================');
  console.log('🏆 ALL POSITIVE & NEGATIVE TENANT ISOLATION TESTS PASSED!');
  console.log('===========================================================');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
