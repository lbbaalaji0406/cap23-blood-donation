# IMPLEMENTATION_PLAN.md
## CAP-23 · Extended Transfusion Ecosystem — Master Implementation Plan (v2.0)

> [!IMPORTANT]
> **Status: FULLY COMPLETED & VERIFIED (v2.0)**  
> Audited and co-verified by Antigravity (Lead Architect) and Claude Code (Technical Co-Critic).  
> All 6 milestones (M0 through M6) have been implemented, hardened against critical vulnerabilities, and verified through automated end-to-end test suites.

---

## Executive Summary of Completed Milestones

```
[Milestone 0] Foundations, Pure Domain Core & Parity Verification  ─────────► ✅ 100% PASSED (192/192 permutations)
[Milestone 1] Storage Ledger, TTI Certification & PII Boundary     ─────────► ✅ 100% PASSED (Maker-Checker & 30m Return)
[Milestone 2] FEFO Inventory Allocation, Mode A/B & Ghost Guard    ─────────► ✅ 100% PASSED (Zero double-allocations)
[Milestone 3] Tiered Routine & Urgent Donor Dispatch               ─────────► ✅ 100% PASSED (25 parallel donors race)
[Milestone 4] Multi-Tenant Hospital Requisition Portal             ─────────► ✅ 100% PASSED (AC-SEC-01 tenant isolation)
[Milestone 5] Blood Drives, Batch Manifests & Bulk Certification   ─────────► ✅ 100% PASSED (50-unit batch, negative filter)
[Milestone 6] Community SOS Appeal & Anti-DoS Capping              ─────────► ✅ 100% PASSED (3x unitsNeeded cap, phone masked)
```

---

## Architectural Principles & Hardened Invariants

1. **Reality Over Software (Ghost Inventory Prevention):** Software never marks an unconfirmed unit as available. On timeout, units enter `ISSUE_UNCONFIRMED`. Late barcode scans are accepted from `{Stock_Reserved, ISSUE_UNCONFIRMED}` with `lateScan: true`.
2. **Server-Enforced Intake & Maker-Checker:** Direct client writes to `/inventory/**` are blocked with `.write: false`. Intake occurs exclusively via `intakeStorageUnit` (stamping `enteredBy = auth.uid` in `Quarantined`). Certification requires a distinct user (`enteredBy !== certifiedBy`) and lab-confirmed forward/reverse ABO + Rh(D) typing.
3. **Universal Collection Facility Routing:** Shared routing engine (`domain/routing.ts`) ensures donors across Routine, Urgent, and Critical dispatches are routed ONLY to licensed blood collection facilities, never to Blood Storage Centres (BSC).
4. **Anti-DoS Public SOS:** Public volunteer pledges never decrement `unitsNeeded`. Only a physical phlebotomy barcode scan decrements need. Pledges are capped at $3 \times \text{initialUnitsNeeded}$.
5. **Driving Safety (Sec 184 MVA):** Zero mid-transit alerts while a donor is marked `EN_ROUTE`. Dead-man timer is a silent server-side watchdog.
6. **Pure Domain Core:** Business rules (`functions/src/domain/*`) have zero external SDK dependencies with clock injection for sub-millisecond unit testing.

---

## Milestone Breakdown & Implementation Record

### Milestone 0: Pure Domain Core & Verification
- **Files:** `functions/src/domain/{compatibility, cooldown, fefo, haversine, routing, par}.ts`
- **Verification:** `test-compatibility-parity.mjs` (192/192 donor-recipient permutations verified).
- **Status:** **COMPLETE ✅**

### Milestone 1: Storage Ledger & Quality Gatekeeper
- **Functions:** `intakeStorageUnit`, `certifyStorageUnit`, `dispatchStorageUnit`
- **Security:** RTDB `.write: false` on `/inventory/**` and `/inventory_donor_ledger/**`. Maker-checker prevents self-certification. 30-minute return rule enforced via server timestamp calculation.
- **Verification:** `test-milestone1-integration.mjs` (9/9 steps passed).
- **Status:** **COMPLETE ✅**

### Milestone 2: Atomic FEFO Allocation & Ghost Inventory Guard
- **Functions:** `reserveFefoUnits`, `reconcileStorageUnit`, watchdog background sweep.
- **Architecture:** Mode A (Certified Chiller Stock) prioritized. Mode B (Live Donor Dispatch) triggered on inventory depletion. Watchdog sweep moves un-scanned reserved bags to `ISSUE_UNCONFIRMED`.
- **Verification:** `test-fefo-concurrency.mjs` (20 parallel requests $\rightarrow$ 2 Mode A, 18 Mode B, 0 double allocations), `test-ghost-inventory-fallback.mjs` (passed).
- **Status:** **COMPLETE ✅**

### Milestone 3: Tiered Routine & Urgent Dispatch
- **Functions:** `claimUrgentSlot`, `processWorkflowState`
- **Architecture:** Dual-lock lease mechanism (`active_donor_matches` + `urgent_claims`). Exponential jitter retry loop under high concurrency. Overflow donors routed to managed `standby_pools`.
- **Verification:** `test-urgent-fcfs-race.mjs` (25 concurrent donors $\rightarrow$ 2 confirmed, 23 standby, 0 unhandled errors).
- **Status:** **COMPLETE ✅**

### Milestone 4: Multi-Tenant Hospital Requisition Portal
- **Functions:** `submitHospitalRequisition`, `cancelHospitalRequisition`
- **Security:** Tenant isolation (AC-SEC-01) locking hospital users to their assigned `hospitalId`. Immutable audit logging. Safe cancellation boundary.
- **Verification:** `test-hospital-id-isolation.mjs` (5/5 positive & negative isolation checks passed).
- **Status:** **COMPLETE ✅**

### Milestone 5: Blood Drives & Batch Manifests
- **Functions:** `submitTransferManifest`, `receiveBatchManifest`, `bulkCertifyBatch`, `recordTransfusionImpact`
- **Architecture:** Batch manifests tracked through `IN_TRANSIT` $\rightarrow$ `RECEIVED_VERIFIED` / `RECEIVED_WITH_DISCREPANCY`. Idempotent chunked bulk certification enforces strict negative-filter (DEC-005/015). Privacy-sanitized donor notification (DPDP Act §8).
- **Verification:** `test-bulk-manifest-certify.mjs` (50 bags processed, 49 certified, 1 discarded, zero FEFO leak).
- **Status:** **COMPLETE ✅**

### Milestone 6: Community SOS Emergency Appeal
- **Functions:** `authorizeCommunitySOS`, `submitPublicVolunteerPledge`
- **Architecture:** Manual Medical Officer gate generating a 128-bit crypto token with 2-hour TTL. Anti-DoS volunteer cap ($3 \times \text{unitsNeeded}$). Public pledges strictly do NOT decrement clinical need. Masked phone numbers in public storage.
- **Verification:** `test-anti-dos-sos-pledge.mjs` (6 pledges accepted, 7th rejected, unitsNeeded untouched, phone masked).
- **Status:** **COMPLETE ✅**

---

## Test Suite Execution Reference

```bash
# Full Verification Suite (All Passing 100%)
node test-milestone1-integration.mjs
node test-fefo-concurrency.mjs
node test-ghost-inventory-fallback.mjs
node test-urgent-fcfs-race.mjs
node test-hospital-id-isolation.mjs
node test-component-cooldowns.mjs
node test-compatibility-parity.mjs
node test-bulk-manifest-certify.mjs
node test-anti-dos-sos-pledge.mjs
node test-inventory-direct-write-denied.mjs
```
