import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const serverCompat = require('./functions/lib/domain/compatibility.js');

// Client implementation pure mirror from src/services/masterService.ts
function clientCompatibility(recipientBloodGroupId, componentType = 'WholeBlood') {
  if (componentType === 'Plasma') {
    switch (recipientBloodGroupId) {
      case 'O_plus':
      case 'O_minus':
        return ['O_plus', 'O_minus', 'A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'A_plus':
      case 'A_minus':
        return ['A_plus', 'A_minus', 'AB_plus', 'AB_minus'];
      case 'B_plus':
      case 'B_minus':
        return ['B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'AB_plus':
      case 'AB_minus':
        return ['AB_plus', 'AB_minus'];
      default:
        return [];
    }
  }

  switch (recipientBloodGroupId) {
    case 'A_plus': return ['A_plus', 'A_minus', 'O_plus', 'O_minus'];
    case 'A_minus': return ['A_minus', 'O_minus'];
    case 'B_plus': return ['B_plus', 'B_minus', 'O_plus', 'O_minus'];
    case 'B_minus': return ['B_minus', 'O_minus'];
    case 'AB_plus': return ['A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus', 'O_plus', 'O_minus'];
    case 'AB_minus': return ['A_minus', 'B_minus', 'AB_minus', 'O_minus'];
    case 'O_plus': return ['O_plus', 'O_minus'];
    case 'O_minus': return ['O_minus'];
    default: return [];
  }
}

const bloodGroups = ['A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus', 'O_plus', 'O_minus'];
const componentTypes = ['WholeBlood', 'Platelets', 'Plasma'];

console.log('--- RUNNING FULL 192 PERMUTATIONS COMPATIBILITY PARITY TEST ---');

let totalTested = 0;
let passed = 0;

for (const recipientGroup of bloodGroups) {
  for (const component of componentTypes) {
    const clientList = clientCompatibility(recipientGroup, component).sort();
    const serverList = serverCompat.getCompatibleDonorGroups(recipientGroup, component).sort();

    assert.deepStrictEqual(
      clientList,
      serverList,
      `Mismatch on compatible donor list for recipient=${recipientGroup}, component=${component}`
    );

    for (const donorGroup of bloodGroups) {
      totalTested++;
      const isClientCompatible = clientList.includes(donorGroup);
      const isServerCompatible = serverCompat.isBloodCompatible(donorGroup, recipientGroup, component);

      assert.strictEqual(
        isClientCompatible,
        isServerCompatible,
        `Mismatch for pairing donor=${donorGroup} -> recipient=${recipientGroup} (component=${component})`
      );
      passed++;
    }
  }
}

console.log(`✅ PASSED: All ${passed}/${totalTested} donor-recipient-component permutations produce 100% identical compatibility!`);
