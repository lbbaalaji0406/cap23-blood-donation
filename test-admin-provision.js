import { initializeApp as initClient } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth as getClientAuth, connectAuthEmulator as connectClientAuthEmulator, signInWithEmailAndPassword } from 'firebase/auth';

import { initializeApp as initAdmin } from 'firebase-admin/app';
import { getDatabase as getAdminDatabase } from 'firebase-admin/database';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';

// 1. Admin SDK Setup (to bypass rules and seed users)
// In emulator mode, we don't need a real service account.
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';

const adminApp = initAdmin({
  projectId: 'cap23-blood-donation',
  databaseURL: 'http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb'
});
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminDatabase(adminApp);

// 2. Client SDK Setup (to simulate actual user requests)
const firebaseConfig = {
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
};
const clientApp = initClient(firebaseConfig);
const clientAuth = getClientAuth(clientApp);
connectClientAuthEmulator(clientAuth, 'http://127.0.0.1:9099');
const clientFunctions = getFunctions(clientApp);
connectFunctionsEmulator(clientFunctions, '127.0.0.1', 5001);

async function runTest() {
  console.log("Testing Admin & Manager Provisioning...");
  try {
    const adminEmail = `admin${Date.now()}@example.com`;
    const managerEmail = `manager${Date.now()}@example.com`;
    const password = 'password123';

    // Seed Admin Account
    const adminRecord = await adminAuth.createUser({ email: adminEmail, password });
    await adminDb.ref(`users/${adminRecord.uid}`).set({
      email: adminEmail,
      name: 'Super Admin',
      role: 'Admin',
      createdAt: new Date().toISOString()
    });

    // Seed Manager Account
    const managerRecord = await adminAuth.createUser({ email: managerEmail, password });
    await adminDb.ref(`users/${managerRecord.uid}`).set({
      email: managerEmail,
      name: 'Camp Manager',
      role: 'Manager',
      campId: 'camp-X',
      createdAt: new Date().toISOString()
    });

    const createUser = httpsCallable(clientFunctions, 'createUserByAdmin');

    // Admin Context
    console.log("\\n--- Admin Context ---");
    await signInWithEmailAndPassword(clientAuth, adminEmail, password);
    try {
      const res = await createUser({ email: `newmgr${Date.now()}@example.com`, name: 'New Mgr', role: 'Manager', campId: 'camp-Y' });
      console.log("SUCCESS: Admin successfully provisioned a Manager.", res.data);
    } catch (e) {
      console.error("FAIL: Admin failed to provision Manager.", e.message);
    }

    // Manager Context
    console.log("\\n--- Manager Context ---");
    await signInWithEmailAndPassword(clientAuth, managerEmail, password);
    
    // Manager provisioning a Donor in same camp
    try {
      const res2 = await createUser({ email: `newdonor${Date.now()}@example.com`, name: 'New Donor', role: 'Donor', campId: 'camp-X' });
      console.log("SUCCESS: Manager successfully provisioned a Donor in their camp.", res2.data);
    } catch (e) {
      console.error("FAIL: Manager failed to provision Donor in their camp.", e.message);
    }

    // Manager trying to provision a Donor in DIFFERENT camp
    try {
      await createUser({ email: `hackerdonor${Date.now()}@example.com`, name: 'Bad Donor', role: 'Donor', campId: 'camp-Z' });
      console.error("FAIL: Manager provisioned Donor in different camp!");
    } catch (e) {
      console.log("SUCCESS: Manager prevented from provisioning Donor in different camp.");
    }

    // Manager trying to provision an Admin
    try {
      await createUser({ email: `hackeradmin${Date.now()}@example.com`, name: 'Bad Admin', role: 'Admin', campId: 'camp-X' });
      console.error("FAIL: Manager provisioned an Admin!");
    } catch (e) {
      console.log("SUCCESS: Manager prevented from provisioning Admin.");
    }

    process.exit(0);
  } catch (error) {
    console.error("Test failed:", error);
    process.exit(1);
  }
}
runTest();
