# FDD — Functional Design Document
## CAP-23 · Extended Blood Donation & Transfusion Ecosystem (M1–M6)

**Domain:** Healthcare / Transfusion Medicine  
**Status:** v2.0 — Production-Hardened Baseline (Milestones 1–6 Complete)  
**Regulatory Baseline:** Drugs and Cosmetics Rules 1945 (Schedule F Part XII-B), DGHS/NBTC Standards, DPDP Act 2023, Motor Vehicles Act Sec 184  
**Last updated:** 2026-11-12  

---

## 1 · Business Problem & Scope
Connect clinical blood requisitions with certified inventory and voluntary donors across hospital networks and mobile donation drives. Prevent stock spoilage via First-Expiry-First-Out (FEFO) allocation, prevent over-allocation through atomic locks, ensure compliance with maker-checker safety gates, and strictly isolate patient and donor PII.

---

## 2 · System Actors & Role-Based Access Control (RBAC)

| Role | Domain Title | Key Responsibilities | Access Scope & Security Constraints |
|---|---|---|---|
| **Admin** | System Administrator | Masters CRUD, user management, audit review, system config, terminal state transitions (`Closed`, `Unfulfilled`). | Global system-wide read/write across all camps, hospitals, and units. |
| **Manager / CampCoordinator** | Camp Coordinator | Camp operations, donor recruitment, mobile drive batch manifests, donor verification, matching. | Strictly scoped to assigned `campId` (D-002). Cannot access unassigned camps or direct inventory writes. |
| **Storage** | Blood Storage Officer / Tech | Physical intake, Maker-Checker TTI certification, dispatch scanning, reconciliation, batch manifest receipt. | Access to `/inventory`, `/inventory_donor_ledger`, and `/transfer_manifests`. Cannot certify own intaked units. |
| **Hospital** | Hospital Staff / Medical Officer | Blood requisition submission, emergency status tracking, SOS appeal authorization (MO only). | Scoped strictly to linked `hospitalId` (AC-SEC-01). Zero visibility into unassigned patient data or donor PII. |
| **User / Donor** | Voluntary Blood Donor | Self-registration, medical history questionnaire, urgent slot claim, donation impact tracker. | Scoped strictly to self UID (`/users/{uid}`, `/donor_history/{uid}`, `/donor_transfusion_impacts/{uid}`). |

---

## 3 · Core Functional Modules (Milestones 1 – 6)

### Milestone 1: Physical Bag Verification & Maker-Checker Safety Gate
- **Physical Bag Intake:** Lab technician intakes collected units into `Quarantined` status via `intakeStorageUnit`.
- **Maker-Checker Verification (DEC-005):** Units can only be moved to active `Certified` status by a distinct Storage Officer (`enteredBy !== certifiedBy`).
- **30-Minute Cold-Chain Return Rule:** Blood returned within 30 minutes with cold chain intact can be returned to active inventory; bags exceeding 30 minutes are safely discarded.
- **Medical Cooldown Engine:** Enforces DGHS component-specific intervals (90 days for Whole Blood, 28 days for Platelets/Plasma reciprocal, inter-donation caps).

### Milestone 2: Atomic FEFO Inventory Allocation & Ghost Inventory Guard
- **Mode A (Certified Inventory):** Requisitions atomically reserve physical units using First-Expiry-First-Out (`inventory/fefo/{group}_{component}`).
- **Mode B (Live Donor Dispatch):** Fallback mechanism automatically triggers targeted donor dispatch when chiller inventory is depleted.
- **Ghost Inventory Protection:** If reserved units are not physically scanned within the 10-minute dispatch window, a watchdog sweep locks them into `ISSUE_UNCONFIRMED` to prevent phantom inventory.
- **Physical Reconciliation Desk:** Storage Officers physically verify unconfirmed bags to either restore them to active stock or discard them with logged reasons.

### Milestone 3: Tiered Routine & Urgent Donor Dispatch
- **Urgent FCFS Atomic Claiming:** Emergency requisitions permit concurrent donor slot claiming with double-lock lease management.
- **Standby Donor Pool:** Zero-rejection policy automatically routes overflow donors into a managed standby pool.
- **Licensed Facility Routing:** Shared routing engine directs donors strictly to licensed blood collection facilities, never to blood storage centres without collection licenses.

### Milestone 4: Multi-Tenant Hospital Requisition Portal
- **Tenant Isolation (AC-SEC-01):** Hospital accounts are cryptographically locked to their assigned `hospitalId`. Any cross-tenant read or write is rejected at the database rules layer.
- **Requisition Lifecycle:** Hospitals create requisitions in `Registered` status; cancellations are permitted only while in `Registered` state.

### Milestone 5: Blood Drives & Batch Manifests
- **Batch Transfer Manifests:** Camp coordinators dispatch batches of collected units (`IN_TRANSIT`).
- **Discrepancy Detection:** Receiving storage officers scan barcodes upon arrival; system flags missing or unexpected units (`RECEIVED_WITH_DISCREPANCY` vs `RECEIVED_VERIFIED`).
- **Chunked Bulk Certification (DEC-015):** Idempotent 50-unit chunks apply a strict negative-filter invariant—only explicitly negative units reach active FEFO shelves; reactive units are permanently isolated and discarded.
- **Transfusion Impact Tracker (DPDP Act §8):** Privacy-sanitized notification sent to donors when their blood is transfused (showing city and timestamp, zero patient or clinical diagnosis PII).

### Milestone 6: Community SOS Emergency Appeal
- **Medical Officer Gate:** Authorized exclusively by verified Medical Officers or Admins for urgent/critical unfulfilled requisitions.
- **Crypto-Secure Opaque Token:** Generates a 128-bit random token with a strict 2-hour TTL.
- **Anti-DoS Volunteer Cap:** Public walk-in pledges are capped at $3 \times \text{unitsNeeded}$ to prevent hospital swarming.
- **Clinical Invariant:** Public volunteer pledges **never** decrement clinical `unitsNeeded`. The hospital need remains intact until blood is physically collected, tested, and released.
- **Privacy Masking:** Donor phone numbers are masked (`98****3211`) in public registries.

---

## 4 · Transfusion Compatibility Rules
ABO & Rh(D) compatibility enforced identically on client and server (192 verified permutations):
- **Red Cells / Whole Blood / Platelets:** Standard ABO/Rh compatibility. Universal donor is O-negative; universal recipient is AB-positive.
- **Fresh Frozen Plasma (FFP):** Exact inverse of red cells. Universal donor is AB; universal recipient is O. Rh factor is clinically irrelevant for plasma.

---

## 5 · Compliance & Data Protection Matrix

| Regulatory Requirement | System Enforcement Mechanism |
|---|---|
| **Drugs & Cosmetics Rules 1945** | Strict Maker-Checker certification; mandatory serology testing before stock entry; 30-minute return rule. |
| **DGHS / NACO Guidelines** | Automated component cooldown calculations; annual and weekly apheresis donation limits. |
| **DPDP Act 2023** | Split-node PII architecture; recipient names hidden from unassigned actors; masked phone numbers in public SOS registries; transfusion notifications reveal no clinical context. |
| **Motor Vehicles Act § 184** | Silent transit shield: zero push notifications or cognitive distractions while a donor is marked `EN_ROUTE`. |
