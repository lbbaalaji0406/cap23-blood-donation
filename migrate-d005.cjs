const { initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');

let serviceAccount;
try {
  serviceAccount = require('./serviceAccountKey.json');
} catch (err) {
  console.error("Please place serviceAccountKey.json in the root directory before running this script.");
  process.exit(1);
}

const app = initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://cap23-blood-donation-default-rtdb.asia-southeast1.firebasedatabase.app"
});

const db = getDatabase(app);

async function migrate() {
  console.log("Starting migration D-005: Restructuring donation_request...");
  const rootRef = db.ref('transactions/donation_request');
  const snapshot = await rootRef.once('value');
  
  if (!snapshot.exists()) {
    console.log("No records to migrate.");
    process.exit(0);
  }

  const oldData = snapshot.val();
  const writes = [];
  const deletes = [];

  for (const [id, record] of Object.entries(oldData)) {
    // Determine if it's an old flat record by checking if it has a campId field inside
    if (record && typeof record === 'object' && record.campId && typeof record.campId === 'string') {
      const campId = record.campId;
      
      const newRecord = { ...record };
      delete newRecord.campId; // No longer needed in the body
      
      const newPathRef = db.ref(`transactions/donation_request/${campId}/${id}`);
      
      writes.push(
        newPathRef.set(newRecord).then(() => {
          console.log(`Prepared write: Migrated record ${id} to camp ${campId}`);
        })
      );
      
      // Store reference to delete the old flat node later
      deletes.push(db.ref(`transactions/donation_request/${id}`));
    }
  }

  if (writes.length === 0) {
    console.log("No flat records found to migrate (they may already be migrated or only hierarchical data exists).");
    process.exit(0);
  }

  console.log(`Executing ${writes.length} writes concurrently...`);
  
  try {
    await Promise.all(writes);
    console.log("All writes succeeded! Safe to delete old flat structures.");
    
    // Now execute deletes
    const deletePromises = deletes.map(ref => ref.remove());
    await Promise.all(deletePromises);
    
    console.log("Migration complete. Old flat structures deleted.");
    process.exit(0);
  } catch (error) {
    console.error("Migration failed during writes. Aborting deletes.", error);
    process.exit(1);
  }
}

migrate();
