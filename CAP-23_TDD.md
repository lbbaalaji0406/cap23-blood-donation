# TDD — Technical Design Document
## CAP-23 · Extended Blood Donation & Transfusion Ecosystem (M1–M6)

**Status:** v2.0 — Production-Hardened Baseline (Milestones 1–6 Complete)  
**Architecture:** Serverless RTDB + Cloud Functions v2 + React 19 Frontend  
**Last updated:** 2026-11-12  

---

## 1 · Technology Stack & Runtime Environment

- **Frontend:** React 19, TypeScript, React Router 7, TailwindCSS v4, Lucide Icons, Vite 8 (Rolldown engine).
- **Backend / Serverless:** Firebase Cloud Functions v2 (Node.js 20, TypeScript), Firebase Admin SDK.
- **Database:** Firebase Realtime Database (RTDB) with custom security rules matrix.
- **Authentication:** Firebase Authentication with Role-Based Access Control (RBAC).
- **Storage / CDN:** Cloudinary API for signed/secure attachment uploads.
- **Local Development / Emulators:** Firebase Local Emulator Suite (Auth: `9099`, RTDB: `9000`, Functions: `5001`, UI: `4000`).

---

## 2 · Database Schema Architecture & Node Paths

```
/
├── users/{uid}                                 // User profiles, roles, campId, hospitalId, medical_referral
├── masters/
│   ├── blood_group/{groupId}                   // ABO + Rh compatibility definitions
│   ├── camp/{campId}                           // Mobile camp details, coordinates, status
│   └── hospital/{hospitalId}                   // Hospital metadata, hasCollectionLicense, BSC routing
├── transactions/
│   └── donation_request/{campId}/{requestId}   // Requisition lifecycle, urgency, units needed/secured
├── hospital_requests/{hospitalId}/{requestId}  // Hospital tenant projection (AC-SEC-01)
├── matches/{requestId}/{donorUid}              // Match declarations, responses
├── active_donor_matches/{donorUid}             // Atomic double-lock leases for donor commitments
├── urgent_claims/{requestId}                   // Atomic FCFS slot reservation counter & claimants
├── standby_pools/{requestId}/{donorUid}        // Overflow standby donor registration
├── inventory/
│   ├── units/{unitId}                          // Public unit records (barcode, group, expiry, status)
│   └── fefo/{group_component}/{expiry_unitId}  // Sorted FEFO active index for sub-millisecond reservations
├── inventory_donor_ledger/{unitId}             // Isolated donor PII ledger (Admin/Storage only)
├── transfer_manifests/{manifestId}             // Blood drive batch manifests & discrepancy logs
├── sos_links/{token}                           // 128-bit crypto tokens for community SOS appeals
├── public_volunteers/{requestId}/{pledgeId}    // Capped volunteer pledges with masked phone numbers
├── donor_transfusion_impacts/{donorUid}/{id}   // Privacy-sanitized donor notifications
├── audit_logs/                                 // Immutable audit trail for all critical actions
└── watchdogs/scan_timeout/{unitId}             // Ghost inventory expiration sweeps
```

---

## 3 · Firebase Cloud Functions Matrix (Core API)

| Function Name | Trigger | Auth / Role Gate | Key Responsibility |
|---|---|---|---|
| `processWorkflowState` | HTTPS Callable | Admin / Manager / Storage / User | Orchestrates requisition transitions, matching, status updates. |
| `intakeStorageUnit` | HTTPS Callable | Storage, Admin | Records newly collected unit into `Quarantined` state. |
| `certifyStorageUnit` | HTTPS Callable | Storage, Admin (`enteredBy !== certifiedBy`) | Maker-Checker lab certification moving unit to `Certified` FEFO shelf. |
| `reserveFefoUnits` | HTTPS Callable | Storage, Admin | Atomically reserves oldest certified units (Mode A) or triggers Mode B. |
| `dispatchStorageUnit` | HTTPS Callable | Storage, Admin | Verifies physical barcode scan and marks unit `Dispatched`. |
| `reconcileStorageUnit` | HTTPS Callable | Storage, Admin | Reconciles unconfirmed bags at physical inspection desk. |
| `claimUrgentSlot` | HTTPS Callable | Registered Donors | Atomic FCFS slot claim with double-lock lease and standby pool overflow. |
| `submitHospitalRequisition`| HTTPS Callable | Hospital, Admin | Submits isolated hospital blood requisition. |
| `cancelHospitalRequisition`| HTTPS Callable | Hospital (own only), Admin | Safely cancels requisition in `Registered` state only. |
| `submitTransferManifest` | HTTPS Callable | CampCoordinator, Admin | Coordinator seals and dispatches blood drive batch manifest. |
| `receiveBatchManifest` | HTTPS Callable | Storage, Admin | Storage officer scans arrival; detects missing and extra barcodes. |
| `bulkCertifyBatch` | HTTPS Callable | Storage, Admin | Idempotent 50-unit chunks applying strict negative-filter invariant. |
| `recordTransfusionImpact` | HTTPS Callable | Hospital, Storage, Admin | Emits DPDP-compliant impact notification to original donor. |
| `authorizeCommunitySOS` | HTTPS Callable | Medical Officer, Admin | Issues 128-bit crypto token with 2-hour TTL for emergency appeals. |
| `submitPublicVolunteerPledge`| HTTPS Callable | Public (Unauthenticated) | Anti-DoS capped volunteer pledge ($3 \times \text{unitsNeeded}$) with masked PII. |

---

## 4 · Concurrency & Race-Condition Engineering

1. **FEFO Inventory Atomic Lease:**
   - Multi-path atomic reservation uses RTDB transactions to prevent race conditions during high-volume demand.
   - If stock is insufficient, system seamlessly declares Mode B donor dispatch without blocking or deadlocking.
2. **Urgent Dispatch Dual-Locking:**
   - Primary lock: `active_donor_matches/{uid}` enforces a single commitment per donor across the platform.
   - Secondary lock: `urgent_claims/{requestId}` atomically allocates slots up to $\lceil \text{unitsNeeded} / 0.8 \rceil$.
   - Dynamic exponential jitter retry handles extreme contention with graceful fallback to `STANDBY`.
3. **Negative-Filter Bulk Certification:**
   - Certification is never a bulk boolean toggle. Each barcode requires explicit negative serology verification.
   - Missing or non-negative results are immediately isolated in `Discarded` status.

---

## 5 · Verification & Acceptance Test Suite

The system includes automated integration suites validating 100% of the functional and security invariants:

| Test Script | Test Target | Key Assertions |
|---|---|---|
| `test-milestone1-integration.mjs` | M1 Workflow | Maker-Checker certification, 30m return rule, physical barcode dispatch. |
| `test-fefo-concurrency.mjs` | M2 Concurrency | 20 parallel requests against 2 certified units: exactly 2 Mode A, 18 Mode B, 0 double allocations. |
| `test-ghost-inventory-fallback.mjs` | M2 Ghost Inventory | Watchdog scan timeout, `ISSUE_UNCONFIRMED` transition, late scan recovery, reconciliation desk. |
| `test-urgent-fcfs-race.mjs` | M3 Urgent FCFS | 25 concurrent donors: 2 confirmed, 23 standby overflow, zero unhandled errors. |
| `test-hospital-id-isolation.mjs` | M4 Tenant Isolation | AC-SEC-01 multi-tenant boundary: cross-hospital mutations rejected with HTTP 401. |
| `test-component-cooldowns.mjs` | Medical Rules | 14/14 DGHS component cooldown rules (WB, Platelets, Plasma, reciprocal). |
| `test-compatibility-parity.mjs` | Blood Group Rules | 192/192 client/server compatibility permutations match with 100% parity. |
| `test-bulk-manifest-certify.mjs` | M5 Drives & Batches | 50-bag batch transfer, discrepancy detection, negative-filter bulk certification, privacy impact. |
| `test-anti-dos-sos-pledge.mjs` | M6 Community SOS | MO authorization, 2h TTL, 6 pledges accepted, 7th pledge rejected (3x cap), phone masked. |
| `test-inventory-direct-write-denied.mjs` | Database Rules | Asserts direct client writes to `/inventory/**` return HTTP 401 Permission Denied. |
