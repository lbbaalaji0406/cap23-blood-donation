import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getAuth } from 'firebase-admin/auth';

process.env.FIREBASE_DATABASE_EMULATOR_HOST = '127.0.0.1:9000';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

const app = initializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const defaultDb = getDatabase(app);
const fallbackApp = initializeApp({
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation"
}, 'fallback');
const fallbackDb = getDatabase(fallbackApp);
const auth = getAuth(app);

async function setBoth(path, value) {
  await Promise.all([
    defaultDb.ref(path).set(value),
    fallbackDb.ref(path).set(value)
  ]);
}

async function getOrCreateUser(email, password, displayName) {
  try {
    const userRecord = await auth.getUserByEmail(email);
    console.log(`[Existing] ${email} (UID: ${userRecord.uid})`);
    await auth.updateUser(userRecord.uid, { password, displayName });
    return userRecord.uid;
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      const userRecord = await auth.createUser({
        email,
        password,
        displayName,
        emailVerified: true
      });
      console.log(`[Created] ${email} (UID: ${userRecord.uid})`);
      return userRecord.uid;
    }
    throw e;
  }
}

async function seed() {
  console.log("=== SEEDING DEMO & TEST ACCOUNTS FOR LOCAL TESTING ===\n");
  const password = "password123";

  // 1. Seed Masters (Hospital, Camp, Blood Groups)
  console.log("Seeding Master Data (Dual Namespace)...");
  await setBoth('masters/hospital/HOS001', {
    name: 'SRM Medical College Hospital',
    code: 'HOS001',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/hospital/HOS002', {
    name: 'Apollo Speciality Hospital',
    code: 'HOS002',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/camp/CAMP001', {
    name: 'SRM Blood Bank Main Camp',
    code: 'CAMP001',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/camp/CAMP002', {
    name: 'Tambaram Community Center Camp',
    code: 'CAMP002',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });

  const bloodGroups = {
    A_plus: { name: 'A Positive', code: 'A+', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['A+', 'AB+'] },
    A_minus: { name: 'A Negative', code: 'A-', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['A+', 'A-', 'AB+', 'AB-'] },
    B_plus: { name: 'B Positive', code: 'B+', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['B+', 'AB+'] },
    B_minus: { name: 'B Negative', code: 'B-', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['B+', 'B-', 'AB+', 'AB-'] },
    AB_plus: { name: 'AB Positive', code: 'AB+', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['AB+'] },
    AB_minus: { name: 'AB Negative', code: 'AB-', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['AB+', 'AB-'] },
    O_plus: { name: 'O Positive', code: 'O+', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['O+', 'A+', 'B+', 'AB+'] },
    O_minus: { name: 'O Negative', code: 'O-', active: true, createdAt: new Date().toISOString(), createdBy: 'system', compatibleRecipients: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'] }
  };
  await setBoth('masters/blood_group', bloodGroups);
  console.log("✓ Masters seeded (Hospitals, Camps, & Blood Groups across both namespaces)\n");

  // 2. Admin User
  const adminUid = await getOrCreateUser("admin@example.com", password, "Admin User");
  await setBoth(`users/${adminUid}`, {
    email: "admin@example.com",
    name: "Admin User",
    role: "Admin",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 3. Hospital User
  const hospUid = await getOrCreateUser("hospital@example.com", password, "Dr. Ramesh (SRM Hospital)");
  await setBoth(`users/${hospUid}`, {
    email: "hospital@example.com",
    name: "Dr. Ramesh (Blood Bank Incharge)",
    role: "Hospital",
    hospitalId: "HOS001",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 4. Manager User (Camp Coordinator)
  const mgrUid = await getOrCreateUser("manager@example.com", password, "Camp Coordinator");
  await setBoth(`users/${mgrUid}`, {
    email: "manager@example.com",
    name: "Suresh (Camp Coordinator)",
    role: "Manager",
    campId: "CAMP001",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 5. Donor User
  const donorUid = await getOrCreateUser("donor@example.com", password, "Volunteer Donor");
  await setBoth(`users/${donorUid}`, {
    email: "donor@example.com",
    name: "Priya (Volunteer Donor)",
    role: "Donor",
    bloodGroup: "O_plus",
    bloodGroupVerified: true,
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  console.log("\n========================================================");
  console.log("SEEDED ACCOUNTS READY FOR LOGIN (Password: password123):");
  console.log("========================================================");
  console.log("1. Hospital Staff : hospital@example.com / password123 (Role: Hospital, SRM Hospital HOS001)");
  console.log("2. Admin          : admin@example.com    / password123 (Role: Admin)");
  console.log("3. Coordinator    : manager@example.com  / password123 (Role: Manager, Camp CAMP001)");
  console.log("4. Donor          : donor@example.com    / password123 (Role: Donor, Blood Group O+)");
  console.log("========================================================\n");

  process.exit(0);
}

seed().catch(err => {
  console.error("Seeding failed:", err);
  process.exit(1);
});
