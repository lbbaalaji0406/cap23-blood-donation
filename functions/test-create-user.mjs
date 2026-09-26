import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'cap23-blood-donation',
  databaseURL: 'http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb'
});

const args = process.argv.slice(2);
if (args.length < 1) {
  console.error("Please provide the target email address! e.g. node scratch/test-create-user.mjs my-second-email@gmail.com");
  process.exit(1);
}
const email = args[0];

async function run() {
  console.log("1. Minting Admin Custom Token...");
  await admin.database().ref('users/admin-uid-test').set({ role: 'Admin', name: 'Test Admin', email: 'admin@test.com' });
  const customToken = await admin.auth().createCustomToken('admin-uid-test', { role: 'Admin' });
  
  console.log("2. Exchanging for ID Token...");
  // Using the local Emulator Auth endpoint to exchange a custom token for a real ID token
  const res = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: customToken, returnSecureToken: true })
  });
  const data = await res.json();
  const idToken = data.idToken;

  console.log(`3. Calling createUserByAdmin Cloud Function to provision ${email}...`);
  const callRes = await fetch('http://127.0.0.1:5001/cap23-blood-donation/us-central1/createUserByAdmin', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`
    },
    body: JSON.stringify({
      data: {
        email: email,
        name: 'Activation Test User',
        role: 'Donor',
        phoneNumber: '9999999999',
        bloodGroup: 'B_pos'
      }
    })
  });
  
  const callData = await callRes.json();
  console.log("4. Function Response:");
  console.log(JSON.stringify(callData, null, 2));
  
  console.log("\nIf success is true, please check the inbox for the activation email!");
  process.exit(0);
}

run().catch(console.error);
