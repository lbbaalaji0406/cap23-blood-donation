// clean-seed-database.mjs
// Pristine, minimal database reset for manual exploration & verification

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
  console.log("--> Wiping all Realtime Database nodes...");
  const pathsToWipe = [
    'users',
    'transactions',
    'hospital_requests',
    'hospital_issues',
    'matches',
    'active_donor_matches',
    'urgent_claims',
    'standby_pools',
    'inventory',
    'inventory_donor_ledger',
    'transfer_manifests',
    'sos_links',
    'public_volunteers',
    'donor_transfusion_impacts',
    'audit_logs',
    'donor_history',
    'donor_eligibility',
    'watchdogs',
    'comments',
    'attachments'
  ];
  for (const p of pathsToWipe) {
    await setBoth(p, null);
  }
  console.log("✓ Realtime Database completely wiped.\n");
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
        console.log(`  Deleted ${uids.length} existing auth user(s).`);
      }
      pageToken = listUsersResult.pageToken;
    } while (pageToken);
    console.log("✓ All Auth users deleted.\n");
  } catch (err) {
    console.error("Error wiping auth users:", err);
  }
}

async function createAccount({ email, password, name, role, campId, hospitalId, bloodGroup, bloodGroupVerified, isMedicalOfficer }) {
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
  if (isMedicalOfficer) profile.isMedicalOfficer = isMedicalOfficer;

  await setBoth(`users/${userRecord.uid}`, profile);
  console.log(`✓ [${role.padEnd(9)}] ${email.padEnd(25)} -> ${name}`);
  return userRecord.uid;
}

async function run() {
  console.log("=====================================================================");
  console.log("       PRISTINE MINIMAL DATABASE RESET (1 ADMIN, 2 COORD, 3 DONORS)  ");
  console.log("=====================================================================\n");

  await wipeDatabase();
  await wipeAuthUsers();

  console.log("--> Seeding Master Data...");

  // 1. Two Camps
  await setBoth('masters/camp/CAMP001', {
    name: 'SRM Blood Bank Main Camp',
    code: 'CAMP001',
    active: true,
    location: 'Kattankulathur, Chennai',
    latitude: 12.823,
    longitude: 80.044,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/camp/CAMP002', {
    name: 'Tambaram Community Camp',
    code: 'CAMP002',
    active: true,
    location: 'Tambaram West, Chennai',
    latitude: 12.924,
    longitude: 80.127,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });

  // 2. Two Hospitals
  await setBoth('masters/hospital/HOS001', {
    name: 'SRM Medical College Hospital',
    code: 'HOS001',
    active: true,
    location: 'Potheri, Chennai',
    latitude: 12.825,
    longitude: 80.046,
    hasCollectionLicense: true,
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });
  await setBoth('masters/hospital/HOS002', {
    name: 'City Trauma Emergency Centre',
    code: 'HOS002',
    active: true,
    location: 'Tambaram East, Chennai',
    latitude: 12.926,
    longitude: 80.130,
    hasCollectionLicense: false,
    collectionFacilityId: 'HOS001',
    createdAt: new Date().toISOString(),
    createdBy: 'system'
  });

  // 3. Eight Blood Groups
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

  console.log("--> Creating Clean Demo Accounts (Password: password123)...");
  const commonPassword = "password123";

  // 1 Admin
  const adminUid = await createAccount({
    email: "admin@example.com",
    password: commonPassword,
    name: "System Administrator",
    role: "Admin"
  });

  // 2 Camp Coordinators
  const coord1Uid = await createAccount({
    email: "coordinator1@example.com",
    password: commonPassword,
    name: "Suresh (Camp 1 Coordinator)",
    role: "Manager",
    campId: "CAMP001"
  });
  const coord2Uid = await createAccount({
    email: "coordinator2@example.com",
    password: commonPassword,
    name: "Priya (Camp 2 Coordinator)",
    role: "Manager",
    campId: "CAMP002"
  });

  // 1 Intake Lab Technician (The Maker)
  const intakeUid = await createAccount({
    email: "intake@example.com",
    password: commonPassword,
    name: "Kavitha (Intake Lab Tech)",
    role: "Storage"
  });

  // 1 Storage Quality Officer (The Checker)
  const storageUid = await createAccount({
    email: "storage@example.com",
    password: commonPassword,
    name: "Anitha (Storage Quality Officer)",
    role: "Storage"
  });

  // 1 Hospital Staff / Medical Officer
  const hospitalUid = await createAccount({
    email: "hospital@example.com",
    password: commonPassword,
    name: "Dr. Ramesh (Medical Officer)",
    role: "Hospital",
    hospitalId: "HOS001",
    isMedicalOfficer: true
  });

  // 3 Voluntary Donors
  const donor1Uid = await createAccount({
    email: "donor1@example.com",
    password: commonPassword,
    name: "Rahul Sharma (O+ Donor)",
    role: "Donor",
    bloodGroup: "O_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });
  const donor2Uid = await createAccount({
    email: "donor2@example.com",
    password: commonPassword,
    name: "Ananya Roy (A+ Donor)",
    role: "Donor",
    bloodGroup: "A_plus",
    bloodGroupVerified: true,
    campId: "CAMP001"
  });
  const donor3Uid = await createAccount({
    email: "donor3@example.com",
    password: commonPassword,
    name: "Vikram Singh (B- Donor)",
    role: "Donor",
    bloodGroup: "B_minus",
    bloodGroupVerified: true,
    campId: "CAMP002"
  });

  console.log("\n--> Seeding Sample Initial Data for Immediate Testing...");

  const now = Date.now();
  const thirtyDaysAhead = now + (30 * 24 * 60 * 60 * 1000);

  // 1. Certified Bag in FEFO Chiller (O+ Whole Blood)
  const unit1Id = "BAG-O-PLUS-001";
  const unit1ExpiryEpoch = thirtyDaysAhead;
  await setBoth(`inventory/units/${unit1Id}`, {
    unitId: unit1Id,
    bagBarcode: "BAG-O-PLUS-001",
    bloodGroup: "O_plus",
    componentType: "WholeBlood",
    volumeMl: 450,
    collectionDate: new Date(now - 86400000).toISOString(),
    expiryDate: new Date(unit1ExpiryEpoch).toISOString(),
    status: "Certified",
    storageLocation: "Chiller-Shelf-A1",
    sourceCampId: "CAMP001",
    enteredBy: adminUid,
    certifiedBy: storageUid,
    certifiedAt: now - 3600000
  });
  await setBoth(`inventory/fefo/O_plus_WholeBlood/${unit1ExpiryEpoch}_${unit1Id}`, true);

  // 2. Certified Bag in FEFO Chiller (A+ Whole Blood)
  const unit2Id = "BAG-A-PLUS-002";
  const unit2ExpiryEpoch = thirtyDaysAhead + 86400000;
  await setBoth(`inventory/units/${unit2Id}`, {
    unitId: unit2Id,
    bagBarcode: "BAG-A-PLUS-002",
    bloodGroup: "A_plus",
    componentType: "WholeBlood",
    volumeMl: 450,
    collectionDate: new Date(now - 86400000).toISOString(),
    expiryDate: new Date(unit2ExpiryEpoch).toISOString(),
    status: "Certified",
    storageLocation: "Chiller-Shelf-B2",
    sourceCampId: "CAMP001",
    enteredBy: adminUid,
    certifiedBy: storageUid,
    certifiedAt: now - 3600000
  });
  await setBoth(`inventory/fefo/A_plus_WholeBlood/${unit2ExpiryEpoch}_${unit2Id}`, true);

  // 3. One Quarantined Bag (For Maker-Checker manual testing by Storage Officer)
  const rawBagId = "BAG-RAW-003";
  await setBoth(`inventory/units/${rawBagId}`, {
    unitId: rawBagId,
    bagBarcode: "BAG-RAW-003",
    bloodGroup: "B_minus",
    componentType: "WholeBlood",
    volumeMl: 450,
    collectionDate: new Date().toISOString(),
    expiryDate: new Date(thirtyDaysAhead).toISOString(),
    status: "Quarantined",
    storageLocation: "Quarantine-Dock",
    sourceCampId: "CAMP002",
    enteredBy: intakeUid
  });

  // 4. One Sample Requisition from Hospital HOS001
  const sampleReqId = "REQ-SAMPLE-001";
  const reqPayload = {
    requestId: sampleReqId,
    campId: "CAMP001",
    recipientName: "Kavitha Sundaram",
    recipientHospitalId: "HOS001",
    blood_groupId: "O_plus",
    componentType: "WholeBlood",
    unitsNeeded: 1,
    unitsSecured: 0,
    urgency: "Routine",
    status: "Registered",
    notes: "Elective orthopedic surgery preparation",
    patientId: "PAT-9842",
    createdBy: hospitalUid,
    createdByName: "Dr. Ramesh (Medical Officer)",
    createdAt: now,
    updatedAt: now
  };
  await setBoth(`transactions/donation_request/CAMP001/${sampleReqId}`, reqPayload);
  await setBoth(`hospital_requests/HOS001/${sampleReqId}`, reqPayload);

  console.log("✓ Sample units & requisition seeded successfully.\n");
  console.log("=====================================================================");
  console.log("                      DATABASE IS CLEAN AND READY!                   ");
  console.log("=====================================================================\n");
  process.exit(0);
}

run().catch(err => {
  console.error("Clean seed error:", err);
  process.exit(1);
});
