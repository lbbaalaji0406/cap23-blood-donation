import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'cap23-blood-donation',
  databaseURL: 'http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb'
});

async function run() {
  const bloodGroups = {
    A_plus: true,
    A_minus: true,
    B_plus: true,
    B_minus: true,
    AB_plus: true,
    AB_minus: true,
    O_plus: true,
    O_minus: true
  };
  
  console.log("Seeding masters/blood_group...");
  await admin.database().ref('masters/blood_group').set(bloodGroups);
  console.log("Successfully seeded.");
  process.exit(0);
}

run();
