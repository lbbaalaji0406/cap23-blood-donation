import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getDatabase, ref, set, get, remove } from 'firebase/database';
import fs from 'fs';

const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#'))
    .map(line => line.split('=').map(s => s.trim().replace(/^"|"$/g, '')))
);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: env.VITE_FIREBASE_DATABASE_URL,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Use logic identical to masterService.ts
const sanitizeId = (code) => code.replace('+', '_plus').replace('-', '_minus');

const deleteBloodGroup = async (code) => {
  const snapshot = await get(ref(db, 'masters/blood_group'));
  if (snapshot.exists()) {
    const allGroups = snapshot.val();
    for (const [id, group] of Object.entries(allGroups)) {
      if (group.code !== code && group.compatibleRecipients && group.compatibleRecipients.includes(code)) {
        throw new Error(`Cannot delete: Blood Group ${code} is referenced by ${group.code}.`);
      }
    }
  }
  const id = sanitizeId(code);
  await remove(ref(db, `masters/blood_group/${id}`));
};

async function runTest() {
  console.log('--- Starting D-007 Exploit Test ---');
  console.log('Attempting unauthenticated write to masters/blood_group...');
  
  try {
    // Attempting to inject a malicious blood group without Admin auth
    await set(ref(db, 'masters/blood_group/HACKED'), {
      code: 'HACKED',
      name: 'Hacked Group',
      compatibleRecipients: ['A+']
    });
    
    // If we reach here, the database rules failed to block the write!
    console.error('❌ EXPLOIT SUCCESSFUL: Database rules are vulnerable!');
    process.exit(1);
  } catch (error) {
    if (error.message.includes('permission_denied') || error.message.includes('Permission denied')) {
      console.log('✅ EXPLOIT BLOCKED: permission_denied');
      console.log('Database rules successfully protected the masters node from unauthorized access.');
      process.exit(0);
    } else {
      console.error('⚠️ UNEXPECTED ERROR:', error);
      process.exit(1);
    }
  }
}

runTest();
