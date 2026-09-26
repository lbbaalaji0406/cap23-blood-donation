const admin = require("firebase-admin");
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099";
process.env.FIREBASE_DATABASE_EMULATOR_HOST = "127.0.0.1:9000";

admin.initializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});

async function runTest() {
  try {
    const db = admin.database();
    
    // First, verify there is an admin user.
    // I can just read it directly since I am using Admin SDK.
    const users = await db.ref('users').once('value');
    console.log("Users:", users.val());

    // Write a dummy audit log to ensure it exists
    await db.ref('audit_logs/donation_requests/test-id/push-1').set({
      actorUid: 'admin-1',
      actorName: 'Admin',
      action: 'TEST',
      status: 'Success',
      timestamp: Date.now()
    });
    
    // Now simulate an Admin reading via CLIENT SDK
    const { initializeApp } = require('firebase/app');
    const { getDatabase, ref, get, set, connectDatabaseEmulator } = require('firebase/database');
    const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } = require('firebase/auth');
    
    const clientApp = initializeApp({
      apiKey: "fake-api-key",
      projectId: "cap23-blood-donation",
      databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
    }, "clientApp");
    const clientDb = getDatabase(clientApp);
    connectDatabaseEmulator(clientDb, '127.0.0.1', 9000);
    const clientAuth = getAuth(clientApp);
    connectAuthEmulator(clientAuth, 'http://127.0.0.1:9099');
    
    const email = `admin${Date.now()}@example.com`;
    const userCred = await createUserWithEmailAndPassword(clientAuth, email, 'password123');
    const uid = userCred.user.uid;
    
    // Use Admin SDK to set the role to Admin
    await db.ref(`users/${uid}`).set({
      email: email,
      role: 'Admin'
    });
    console.log("Admin user created.");
    
    // Now read as Admin client
    const snap = await get(ref(clientDb, 'audit_logs/donation_requests/test-id'));
    console.log("SUCCESS! Admin can read. Value:", snap.val());
  } catch (e) {
    console.error("DENIED! Error:", e.message);
  }
  process.exit(0);
}

runTest();
