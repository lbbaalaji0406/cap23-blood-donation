import { evaluateDonorEligibility, TRANSFUSION_CONFIG } from './functions/lib/index.js';

console.log("=================================================");
console.log("TRANSFUSION MEDICINE COMPONENT COOLDOWN TEST SUITE");
console.log("=================================================\n");

let passed = 0;
let failed = 0;

function assert(condition, testName, detail = '') {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}: ${detail}`);
    failed++;
  }
}

const now = Date.now();
const msInDay = 24 * 60 * 60 * 1000;

// TEST GROUP 1: WHOLE BLOOD REQUESTS
console.log("--- 1. Whole Blood Rules (90d WB, 28d Apheresis DGHS Reciprocal) ---");

// Test 1.1: Donor with WB 15 days ago
const r1 = evaluateDonorEligibility([
  { requestId: 'req1', donationDate: now - 15 * msInDay, componentType: 'WholeBlood' }
], 'WholeBlood', now);
assert(!r1.isEligible && r1.reason.includes('90 days'), 'Donor with WB 15 days ago blocked from WB (< 90d)', r1.reason);

// Test 1.2: Donor with Platelets 10 days ago (DGHS Reciprocal Rule)
const r2 = evaluateDonorEligibility([
  { requestId: 'req2', donationDate: now - 10 * msInDay, componentType: 'Platelets' }
], 'WholeBlood', now);
assert(!r2.isEligible && r2.reason.includes('28 days after plateletpheresis'), 'Donor with Platelets 10 days ago blocked from WB (< 28d DGHS reciprocal)', r2.reason);

// Test 1.3: Donor with Platelets 30 days ago and WB 95 days ago -> Eligible
const r3 = evaluateDonorEligibility([
  { requestId: 'req3a', donationDate: now - 95 * msInDay, componentType: 'WholeBlood' },
  { requestId: 'req3b', donationDate: now - 30 * msInDay, componentType: 'Platelets' }
], 'WholeBlood', now);
assert(r3.isEligible, 'Donor with Platelets 30d ago and WB 95d ago is ELIGIBLE for WB');

// TEST GROUP 2: PLATELETS REQUESTS (Apheresis)
console.log("\n--- 2. Platelets Apheresis Rules (28d WB->Apheresis, 7d Inter-donation, Weekly & Annual Caps) ---");

// Test 2.1: WB 15 days ago blocks Platelets (< 28d DGHS rule)
const r4 = evaluateDonorEligibility([
  { requestId: 'req4', donationDate: now - 15 * msInDay, componentType: 'WholeBlood' }
], 'Platelets', now);
assert(!r4.isEligible && r4.reason.includes('28 days after whole blood'), 'Donor with WB 15 days ago blocked from Platelets (< 28d DGHS rule)', r4.reason);

// Test 2.2: WB 35 days ago allows Platelets (> 28d DGHS rule)
const r5 = evaluateDonorEligibility([
  { requestId: 'req5', donationDate: now - 35 * msInDay, componentType: 'WholeBlood' }
], 'Platelets', now);
assert(r5.isEligible, 'Donor with WB 35 days ago is ELIGIBLE for Platelets (> 28d DGHS rule)');

// Test 2.3: Platelets 4 days ago blocks Platelets (< 7d safe camp interval)
const r6 = evaluateDonorEligibility([
  { requestId: 'req6', donationDate: now - 4 * msInDay, componentType: 'Platelets' }
], 'Platelets', now);
assert(!r6.isEligible && r6.reason.includes('7 days between platelet'), 'Donor with Platelets 4 days ago blocked (< 7d interval)', r6.reason);

// Test 2.4: Platelets 8 days ago allows Platelets (> 7d interval)
const r7 = evaluateDonorEligibility([
  { requestId: 'req7', donationDate: now - 8 * msInDay, componentType: 'Platelets' }
], 'Platelets', now);
assert(r7.isEligible, 'Donor with Platelets 8 days ago is ELIGIBLE for Platelets (> 7d interval)');

// Test 2.5: Statutory Weekly Cap (Max 2 in 7 days)
const r8 = evaluateDonorEligibility([
  { requestId: 'req8a', donationDate: now - 2 * msInDay, componentType: 'Platelets' },
  { requestId: 'req8b', donationDate: now - 5 * msInDay, componentType: 'Platelets' }
], 'Platelets', now);
assert(!r8.isEligible && r8.reason.includes('weekly limit of 2 platelet donations in 7 days'), 'Donor with 2 platelet donations in last 7 days blocked by weekly cap', r8.reason);

// Test 2.6: Statutory Annual Cap (Max 24 in 365 days)
const twentyFourDonations = Array.from({ length: 24 }, (_, i) => ({
  requestId: `donor_annual_${i}`,
  donationDate: now - (i * 10 + 10) * msInDay, // All spread out > 7 days apart within 250 days
  componentType: 'Platelets'
}));
const r9 = evaluateDonorEligibility(twentyFourDonations, 'Platelets', now);
assert(!r9.isEligible && r9.reason.includes('annual limit of 24 platelet donations in 365 days'), 'Donor with 24 platelet donations in last 365 days blocked by annual cap', r9.reason);

// TEST GROUP 3: FRESH FROZEN PLASMA
console.log("\n--- 3. Fresh Frozen Plasma Rules (28d Standalone, 28d from WB, 7d from Platelets) ---");

// Test 3.1: Plasma 14 days ago blocks Plasma (< 28d)
const r10 = evaluateDonorEligibility([
  { requestId: 'req10', donationDate: now - 14 * msInDay, componentType: 'Plasma' }
], 'Plasma', now);
assert(!r10.isEligible && r10.reason.includes('28 days between plasma'), 'Donor with Plasma 14 days ago blocked (< 28d)', r10.reason);

// Test 3.2: Platelets 4 days ago blocks Plasma (< 7d)
const r11 = evaluateDonorEligibility([
  { requestId: 'req11', donationDate: now - 4 * msInDay, componentType: 'Platelets' }
], 'Plasma', now);
assert(!r11.isEligible && r11.reason.includes('7 days after plateletpheresis'), 'Donor with Platelets 4 days ago blocked from Plasma (< 7d)', r11.reason);

// Test 3.3: Plasma 35 days ago allows Plasma (> 28d)
const r12 = evaluateDonorEligibility([
  { requestId: 'req12', donationDate: now - 35 * msInDay, componentType: 'Plasma' }
], 'Plasma', now);
assert(r12.isEligible, 'Donor with Plasma 35 days ago is ELIGIBLE for Plasma (> 28d)');

// TEST GROUP 4: BACKWARDS COMPATIBILITY (LEGACY NULL-HANDLING)
console.log("\n--- 4. Backward Compatibility for Legacy Data ---");

// Test 4.1: Legacy donation record without componentType defaults to WholeBlood
const r13 = evaluateDonorEligibility([
  { requestId: 'legacyReq', donationDate: now - 45 * msInDay } // missing componentType
], 'WholeBlood', now);
assert(!r13.isEligible && r13.reason.includes('90 days'), 'Legacy record without componentType correctly defaults to WholeBlood (blocks at 45d)', r13.reason);

// Test 4.2: Request without requestedComponent defaults to WholeBlood
const r14 = evaluateDonorEligibility([
  { requestId: 'legacyReq2', donationDate: now - 45 * msInDay, componentType: 'WholeBlood' }
], undefined, now);
assert(!r14.isEligible && r14.reason.includes('90 days'), 'Request without componentType correctly defaults to WholeBlood', r14.reason);

console.log("\n=================================================");
console.log(`TOTAL TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
console.log("=================================================");

if (failed > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
