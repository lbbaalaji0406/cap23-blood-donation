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

async function wipeDatabase() {
  console.log("--> Wiping Realtime Database (all namespaces)...");
  const pathsToWipe = [
    'users',
    'transactions',
    'hospital_requests',
    'matches',
    'active_donor_matches',
    'audit_logs',
    'donor_history',
    'donor_eligibility'
  ];
  for (const p of pathsToWipe) {
    await setBoth(p, null);
  }
  console.log("✓ Realtime Database wiped clean.\n");
}

async function wipeAuthUsers() {
  console.log("--> Wiping Auth Emulator users...");
  try {
    let pageToken;
    do {
      const listUsersResult = await auth.listUsers(100, pageToken);
      if (listUsersResult.users.length > 0) {
        const uids = listUsersResult.users.map(u => u.uid);
        await auth.deleteUsers(uids);
        console.log(`  Deleted batch of ${uids.length} auth user(s).`);
      }
      pageToken = listUsersResult.pageToken;
    } while (pageToken);
    console.log("✓ All Auth users deleted.\n");
  } catch (err) {
    console.error("Error wiping auth users:", err);
  }
}

async function createAuthAndRtdbUser({ email, password, name, role, campId, hospitalId, bloodGroup, bloodGroupVerified }) {
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: name,
    emailVerified: true
  });

  const profile = {
    email,
    name,
    role,
    accountStatus: 'active',
    createdAt: new Date().toISOString()
  };

  if (campId) profile.campId = campId;
  if (hospitalId) profile.hospitalId = hospitalId;
  if (bloodGroup) profile.bloodGroup = bloodGroup;
  if (bloodGroupVerified !== undefined) profile.bloodGroupVerified = bloodGroupVerified;

  await setBoth(`users/${userRecord.uid}`, profile);
  console.log(`✓ [${role.padEnd(8)}] ${email.padEnd(26)} -> UID: ${userRecord.uid}`);
  return userRecord.uid;
}

async function seed() {
  console.log("=====================================================================");
  console.log("          BLOOD DONATION PLATFORM — COMPLETE ENVIRONMENT RESET       ");
  console.log("=====================================================================\n");

  // Step 1: Clean slate
  await wipeDatabase();
  await wipeAuthUsers();

  // Step 2: Seed Masters (2 Camps, 2 Hospitals, 8 Blood Groups)
  console.log("--> Seeding Master Data...");
  
  // 2 Camps
  await setBoth('masters/camp/CAMP001', {
    name: 'SRM Blood Bank Main Camp',
    code: 'CAMP001',
    active: true,
    location: 'Kattankulathur, Chennai',
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/camp/CAMP002', {
    name: 'Tambaram Community Center Camp',
    code: 'CAMP002',
    active: true,
    location: 'Tambaram West, Chennai',
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });

  // 2 Hospitals
  await setBoth('masters/hospital/HOS001', {
    name: 'SRM Medical College Hospital',
    code: 'HOS001',
    active: true,
    location: 'Potheri, Chennai',
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/hospital/HOS002', {
    name: 'Apollo Speciality Hospital',
    code: 'HOS002',
    active: true,
    location: 'Vanagaram, Chennai',
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });

  // 8 Blood Groups with compatibility definitions
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
  console.log("✓ Masters seeded (2 Camps, 2 Hospitals, 8 Blood Groups).\n");

  // Step 3: Accounts Setup
  console.log("--> Creating Provisioned Accounts (Password for all: password123)...");
  const password = "password123";

  // 1. Admin
  await createAuthAndRtdbUser({
    email: "admin@example.com",
    password,
    name: "System Administrator",
    role: "Admin"
  });

  // 2. Camp Managers (2 Camps)
  // Camp 1 Manager
  await createAuthAndRtdbUser({
    email: "manager1@example.com",
    password,
    name: "Suresh (SRM Camp Coordinator)",
    role: "Manager",
    campId: "CAMP001"
  });
  // Also create manager@example.com alias for Camp 1
  await createAuthAndRtdbUser({
    email: "manager@example.com",
    password,
    name: "Suresh (Camp 1 Alias)",
    role: "Manager",
    campId: "CAMP001"
  });

  // Camp 2 Manager
  await createAuthAndRtdbUser({
    email: "manager2@example.com",
    password,
    name: "Karthik (Tambaram Coordinator)",
    role: "Manager",
    campId: "CAMP002"
  });

  // 3. Three Donors for Camp 1 (CAMP001)
  await createAuthAndRtdbUser({
    email: "donor1_camp1@example.com",
    password,
    name: "Priya Sharma (Camp 1)",
    role: "Donor",
    bloodGroup: "O_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });
  await createAuthAndRtdbUser({
    email: "donor2_camp1@example.com",
    password,
    name: "Rahul Verma (Camp 1)",
    role: "Donor",
    bloodGroup: "A_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });
  await createAuthAndRtdbUser({
    email: "donor3_camp1@example.com",
    password,
    name: "Ananya Rao (Camp 1)",
    role: "Donor",
    bloodGroup: "B_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });
  // Also create donor@example.com alias for Camp 1
  await createAuthAndRtdbUser({
    email: "donor@example.com",
    password,
    name: "Priya Sharma (Donor Alias)",
    role: "Donor",
    bloodGroup: "O_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });

  // 4. Three Donors for Camp 2 (CAMP002)
  await createAuthAndRtdbUser({
    email: "donor1_camp2@example.com",
    password,
    name: "Deepak Nair (Camp 2)",
    role: "Donor",
    bloodGroup: "O_minus",
    bloodGroupVerified: true,
    campId: "CAMP002"
  });
  await createAuthAndRtdbUser({
    email: "donor2_camp2@example.com",
    password,
    name: "Meera Iyer (Camp 2)",
    role: "Donor",
    bloodGroup: "AB_plus",
    bloodGroupVerified: true,
    campId: "CAMP002"
  });
  await createAuthAndRtdbUser({
    email: "donor3_camp2@example.com",
    password,
    name: "Vikram Patel (Camp 2)",
    role: "Donor",
    bloodGroup: "A_minus",
    bloodGroupVerified: true,
    campId: "CAMP002"
  });

  // 5. Two Hospital Staff (2 Different Hospitals)
  // Hospital 1 Staff (SRM Medical College Hospital - HOS001)
  await createAuthAndRtdbUser({
    email: "hospital1@example.com",
    password,
    name: "Dr. Ramesh (SRM Hospital Incharge)",
    role: "Hospital",
    hospitalId: "HOS001"
  });
  await createAuthAndRtdbUser({
    email: "hospital@example.com",
    password,
    name: "Dr. Ramesh (SRM Staff Alias)",
    role: "Hospital",
    hospitalId: "HOS001"
  });

  // Hospital 2 Staff (Apollo Speciality Hospital - HOS002)
  await createAuthAndRtdbUser({
    email: "hospital2@example.com",
    password,
    name: "Dr. Shalini (Apollo Hospital Staff)",
    role: "Hospital",
    hospitalId: "HOS002"
  });

  console.log("\n=====================================================================");
  console.log("            ALL PROVISIONED ACCOUNTS READY FOR TESTING               ");
  console.log("=====================================================================");
  console.log("Common Password: password123\n");
  console.log("1. System Admin:");
  console.log("   - admin@example.com\n");
  console.log("2. Camp Managers (2 Camps):");
  console.log("   - Camp 1 (SRM Main Camp CAMP001) : manager1@example.com (or manager@example.com)");
  console.log("   - Camp 2 (Tambaram Camp CAMP002) : manager2@example.com\n");
  console.log("3. Donors (3 Per Camp):");
  console.log("   - Camp 1 Donors (CAMP001):");
  console.log("       * donor1_camp1@example.com (Priya Sharma, O+)");
  console.log("       * donor2_camp1@example.com (Rahul Verma, A+)");
  console.log("       * donor3_camp1@example.com (Ananya Rao, B+)");
  console.log("   - Camp 2 Donors (CAMP002):");
  console.log("       * donor1_camp2@example.com (Deepak Nair, O-)");
  console.log("       * donor2_camp2@example.com (Meera Iyer, AB+)");
  console.log("       * donor3_camp2@example.com (Vikram Patel, A-)");
  console.log("\n4. Hospital Staff (2 Different Hospitals):");
  console.log("   - Hospital 1 (SRM Hospital HOS001)   : hospital1@example.com (or hospital@example.com)");
  console.log("   - Hospital 2 (Apollo Hospital HOS002): hospital2@example.com");
  console.log("=====================================================================\n");

  process.exit(0);
}

seed().catch(err => {
  console.error("Failed to seed fresh environment:", err);
  process.exit(1);
});
