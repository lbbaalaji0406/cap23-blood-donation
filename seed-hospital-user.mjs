import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, connectDatabaseEmulator } from 'firebase/database';
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

const app = initializeApp({
  apiKey: "fake-api-key",
  projectId: "cap23-blood-donation",
  databaseURL: "http://127.0.0.1:9000/?ns=cap23-blood-donation-default-rtdb"
});
const db = getDatabase(app);
connectDatabaseEmulator(db, '127.0.0.1', 9000);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function getOrCreateUser(email, password, displayName) {
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    console.log(`[Created] ${email} (UID: ${cred.user.uid})`);
    return cred.user.uid;
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      console.log(`[Existing] ${email} (UID: ${cred.user.uid})`);
      return cred.user.uid;
    }
    throw e;
  }
}

async function seed() {
  console.log("=== SEEDING DEMO & TEST ACCOUNTS FOR LOCAL TESTING ===\n");
  const password = "password123";

  // 1. Seed Masters (Hospital, Camp, Blood Groups)
  console.log("Seeding Master Data...");
  await set(ref(db, 'masters/hospital/HOS001'), {
    name: 'SRM Medical College Hospital',
    code: 'HOS001',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await set(ref(db, 'masters/hospital/HOS002'), {
    name: 'Apollo Speciality Hospital',
    code: 'HOS002',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await set(ref(db, 'masters/camp/CAMP001'), {
    name: 'SRM Blood Bank Main Camp',
    code: 'CAMP001',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await set(ref(db, 'masters/camp/CAMP002'), {
    name: 'Tambaram Community Center Camp',
    code: 'CAMP002',
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  console.log("✓ Masters seeded (Hospitals & Camps)\n");

  // 2. Admin User
  const adminUid = await getOrCreateUser("admin@example.com", password, "Admin User");
  await set(ref(db, `users/${adminUid}`), {
    email: "admin@example.com",
    name: "Admin User",
    role: "Admin",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 3. Hospital User
  const hospUid = await getOrCreateUser("hospital@example.com", password, "Dr. Ramesh (SRM Hospital)");
  await set(ref(db, `users/${hospUid}`), {
    email: "hospital@example.com",
    name: "Dr. Ramesh (Blood Bank Incharge)",
    role: "Hospital",
    hospitalId: "HOS001",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 4. Manager User (Camp Coordinator)
  const mgrUid = await getOrCreateUser("manager@example.com", password, "Camp Coordinator");
  await set(ref(db, `users/${mgrUid}`), {
    email: "manager@example.com",
    name: "Suresh (Camp Coordinator)",
    role: "Manager",
    campId: "CAMP001",
    accountStatus: "active",
    createdAt: new Date().toISOString()
  });

  // 5. Donor User
  const donorUid = await getOrCreateUser("donor@example.com", password, "Volunteer Donor");
  await set(ref(db, `users/${donorUid}`), {
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
