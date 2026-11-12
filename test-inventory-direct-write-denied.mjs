import assert from 'node:assert/strict';

// Static validation of database.rules.json
import fs from 'node:fs';

const rulesRaw = fs.readFileSync('./database.rules.json', 'utf8');
const rules = JSON.parse(rulesRaw);

console.log('--- VERIFYING INVENTORY SECURITY RULES (DEC-023 / B-1) ---');

assert.strictEqual(
  rules.rules.inventory['.write'],
  'false',
  'Security violation: /inventory/.write must be explicitly set to "false" to prevent direct client modifications!'
);

assert.strictEqual(
  rules.rules.inventory_donor_ledger['.write'],
  'false',
  'Security violation: /inventory_donor_ledger/.write must be explicitly set to "false"!'
);

assert.ok(
  rules.rules.inventory['.read'].includes("root.child('users').child(auth.uid).child('role').val() == 'Storage'"),
  'Storage role must have read permission on /inventory/'
);

assert.ok(
  rules.rules.inventory_donor_ledger['.read'].includes("root.child('users').child(auth.uid).child('role').val() == 'Storage'"),
  'Storage role must have read permission on /inventory_donor_ledger/'
);

assert.ok(
  !rules.rules.inventory_donor_ledger['.read'].includes("'Hospital'"),
  'Hospital role must NEVER have read access to /inventory_donor_ledger/'
);

console.log('✅ PASSED: All RTDB inventory security rules successfully enforce zero direct client writes and strict PII isolation!');
