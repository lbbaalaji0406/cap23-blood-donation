# PROJECT_BRIEF.md
## CAP-23 · Blood Donation Management — Extended Transfusion Ecosystem

> [!NOTE]
> This file is maintained by the `project-design-gate` skill. It is the
> single source of truth for requirements during DESIGN DELIBERATION.
> Do not edit manually during an active design review; update it through the
> skill's DISCOVERY mode.

---

## 1. Project Overview

A full-stack, Firebase-backed blood donation management platform connecting
**Hospitals**, **Central Storage / Blood Banks**, **Donation Camps**, and
**Donors**. The system manages the complete vein-to-vein chain of custody for
blood units, from proactive donor mobilization drives through to hospital-side
administration and audit trail.

**Domain:** Transfusion Medicine — Indian regulatory context (NACO, NBTC,
DGHS, Drugs and Cosmetics Rules 1945 Schedule F Part XII-B).

**Stack:** React + TypeScript (Vite), Firebase Realtime Database, Firebase
Cloud Functions (Node 22), Firebase Auth, Firebase Hosting, EmailJS.

---

## 2. Actors (Current + Planned)

| Actor | Role Code | Current | Planned |
|---|---|---|---|
| Admin | `Admin` | ✅ Built | Gains Storage actor provisioning authority |
| Camp Coordinator (Manager) | `Manager` | ✅ Built | Gains Drive Planner, Batch Submit to Storage |
| Donor | `Donor` | ✅ Built | Gains Transit Tracker Bot, Drive RSVP, Impact Tracker |
| Hospital Staff | `Hospital` | ✅ Built | Gains inventory-visible fulfillment status |
| Storage Officer (Lab Tech) | `Storage` | ❌ Planned | New actor: inventory management, TTI certification, FEFO dispatch |

---

## 3. Core Requirements — Phase 1 (Built & Verified)

### 3.1 Workflow State Machine
States: `Registered → Verified → Matched → Donated → Closed` (Admin only).
Terminal: `Unfulfilled` (Admin only, from Registered or Verified).
`Partially Matched` supported when `unitsCollected < unitsNeeded`.
No backward transitions. No skip transitions.

### 3.2 Role-Based Access Control
- Manager: camp-scoped (own `campId` only).
- Admin: system-wide.
- Donor: own records only.
- Hospital: own `hospitalId` requests only.
- All enforced server-side via Firebase security rules and Cloud Functions.

### 3.3 Component-Aware Compatibility Matrix
- WholeBlood / RBC: strict ABO + Rh matching.
- Plasma (FFP): inverted ABO, Rh-independent. AB = universal donor, O = universal recipient.
- Platelets: ABO-identical preferred; Rh-negative female alert for RhIG.
- Implemented in both `src/services/masterService.ts` and `functions/src/index.ts`.
- Parity test required: both copies must produce identical outputs.

### 3.4 Transfusion Cooldown Matrix (DGHS / NACO)
- Whole Blood → Whole Blood: 90 days.
- Apheresis → Whole Blood: 28 days.
- Whole Blood → Apheresis: 28 days.
- Platelets → Platelets: 7 days (statutory max 2/7 days, 24/365 days).
- Plasma → Plasma: 28 days.
- Dynamically computed from timestamps. 14/14 automated tests passing.

### 3.5 Multi-Donor Partial Fulfillment
- Multiple donors can be matched until `unitsNeeded` is satisfied.
- After each donation, if `unitsCollected < unitsNeeded`, status returns to
  `Partially Matched` for additional matching.

### 3.6 Donor-to-Hospital Two-Way Sync
- All status changes sync to both `/transactions/donation_request/{campId}/{id}`
  and `/hospital_requests/{hospitalId}/{id}` atomically.

### 3.7 Audit Logging
- Every status change writes a corresponding entry to `/auditLogs/{requestId}`.

---

## 4. Requirements — Phase 2 (Planned: Tiered Dispatch & Transit Bot)

### 4.1 Routine Dispatch (FIFO Seniority Queue)
- 1-to-1 targeted match.
- Priority: longest time since last donation / earliest enrollment.
- 24-hour donor response SLA.

### 4.2 Urgent Dispatch (All-Donor Broadcast + FCFS Claiming)
- All compatible, eligible donors notified simultaneously.
- Atomic RTDB transaction on `unitsSecured`: first N responders claim slots.
- Other donors receive polite clean dismissal when slots are filled.
- Dashboard auto-cleans fulfilled requests.

### 4.3 Critical Dispatch (Code Red Replenishment Protocol)
- **Clinical reframe confirmed:** Live donors are urgent stock replenishment,
  not immediate trauma supply. Acute emergencies are met from certified cold
  storage inventory.
- 10-minute batch aggregation window (not 90 seconds).
- Donors respond "I'm Available" with server-side distance ranking.
- Server (Cloud Function) computes distance using Haversine formula with
  hospital coordinates from `masters/hospital/{hospitalId}`.
- Closest donor designated Primary, others enter open Standby Pool
  (`/standby_pools/{requestId}/{donorUid}` — separate from `/matches/`).
- Primary response window: 30–45 minutes.
- Arrival window: 1–2 hours.
- In-Transit shield: once Primary taps "On My Way", protected from cancellation.
- Dead-Man's Timer: Primary ETA + configurable grace buffer.
- On Primary timeout: algorithm sweeps live `/standby_pools/` for closest
  current candidate and promotes them to Primary.
- Dual-Absorption policy: if a closer donor appears while Primary is in
  transit, both are collected (STAT unit + replenishment unit).

### 4.4 In-App Transit Tracker Bot
- Rendered on Donor Dashboard when user is Primary or Standby.
- Primary view: hospital name, bay, ETA cutoff countdown.
  Buttons: `[ 🚗 On My Way ]`, `[ 🏥 Arrived at Phlebotomy ]`.
- Standby view: standby confirmation message, stay-ready instruction.

### 4.5 Stage-2 All-Hands Community SOS Appeal
- Triggered only after manual authorization by Camp Coordinator or Medical
  Officer (never automatic).
- Displayed on ALL donor dashboards including incompatible blood groups
  (for viral referral sharing).
- Share SOS via WhatsApp: pre-filled message, hospital name, blood group,
  component, approximate urgency — NO patient name, bed number, or diagnosis.
- Shareable link: HMAC-signed, time-limited (auto-expires on fulfillment or
  after 2 hours, whichever comes first).
- Self-attestation: blood group, medical fitness checkboxes, distance.
  No phone number required.
- Volunteers written to `/public_volunteers/{requestId}/{volunteerId}` (NOT
  under `/matches/`). Flagged `isVerifiedDonor: false`.
- Firebase App Check (not IP rate limiting) to prevent bot submissions.
- Explicit UI disclaimer: pre-screening declaration, not clinical clearance.
- RTDB cleanup job to expire public_volunteer records after request closure.

### 4.6 Notification Channel
- Primary: Firebase Cloud Messaging (FCM) Web Push (< 2s delivery).
- Secondary: RTDB socket (`users/{uid}/notifications`) for active sessions.
- Email: downgraded to async confirmation receipt only (not real-time alerts).
- FCM verification requires a staging Firebase project (not emulator-only).
- Local dev: Two-tier adapter (RTDB mock + console log), same code path.

### 4.7 Scheduling Engine
- Use Google Cloud Tasks (`onTaskDispatched`) as the single mechanism for
  both production and emulator.
- Do not use a separate polling daemon for local dev.
- All timeout evaluations: idempotent via RTDB transaction on request node.

---

## 5. Requirements — Phase 3 (Planned: Central Storage Inventory)

### 5.1 Storage Actor
- New role: `Storage` (Storage Officer / Lab Technician).
- Only Admin can provision Storage accounts.
- Storage is the quality gatekeeper between Camp collections and Hospital use.

### 5.2 Inventory Schema
- Path: `inventory/units/{unitId}` (NOT under `masters/` — high-churn
  transactional data).
- Fields: `unitId`, `bagBarcode`, `bloodGroup`, `componentType`,
  `volumeMl`, `collectionDate`, `expiryDate`, `preservativeSolution`,
  `storageTemperatureCelsius`, `status`, `storageLocation`, `sourceCampId`,
  `sourceBatchId`, `testedBy`, `certifiedAt`, `donorRef` (internal audit
  only, not exposed to Hospital).

### 5.3 Status Lifecycle
```
Quarantined → Certified → Reserved → Dispatched → Transfused
                                                 → Returned → (re-evaluate cold chain)
           → Discarded (TTI reactive, hemolyzed, clotted, bag leak, cold chain breach)
Certified  → Expired (FEFO timer expired before allocation)
```

### 5.4 Shelf Life (Per Preservative)
- PRBC with CPDA-1: 35 days.
- PRBC with SAGM (additive): 42 days.
- Platelets (agitated 20–24°C): 5 days.
- FFP at −18°C to −25°C: 3 months.
- FFP at −30°C or colder: 12 months.
- Stored per unit based on `preservativeSolution` and `storageTemperatureCelsius`.

### 5.5 FEFO (First-Expired, First-Out) Engine
- When fulfilling a hospital request, inventory engine selects certified units
  with earliest expiry date first.
- Color-coded shelf countdown badges in Storage dashboard.
- Automatic wastage alert for Platelets within 24h of expiry.

### 5.6 Fulfillment Modes
- **Mode A (Stock Hit):** Storage fulfills from certified shelf inventory.
  Status: `Registered → Stock_Reserved → Dispatched → Closed`.
  10-minute physical barcode scan confirmation timer. If not confirmed within
  10 minutes, falls back to Mode B automatically.
- **Mode B (Stock Deficit):** Storage alerts Camp Coordinator to mobilize
  donors. Camp runs Tiered Dispatch Engine.
  Status: `Registered → Verified → Matched → Donated → Quarantined_Testing
  → Dispatched → Closed`.

### 5.7 Red-Cell Substitution
- Inventory engine suggests (never auto-allocates) compatible alternatives
  when exact group is depleted.
- Storage Officer must explicitly approve substitution.
- No automatic O-negative depletion without officer decision.

### 5.8 TTI Certification (Immutable Gate)
- `certifyStorageUnit` is a Cloud Function only (no direct client writes to
  `inventory/units/{unitId}/status`).
- Caller must have `role === 'Storage'` or `role === 'Admin'`.
- Once `Certified`, status is immutable forward-only (cannot un-certify).
- Mandatory audit log entry: actor UID, timestamp, bag barcode, component
  volume, TTI test kit lot number.

### 5.9 30-Minute Return Rule
- App records physical issue and return timestamps.
- Storage Officer provides mandatory cold-chain attestation:
  `coldChainIntact: boolean`, `returnTempCelsius: number`.
- Software cannot measure physical temperature — attestation is manual.

### 5.10 Donor-to-Bag Traceability (PII boundary)
- Hospital ward sees only: `bagBarcode`, `bloodGroup`, `componentType`,
  `expiryDate`.
- Internal audit ledger retains `bagBarcode ↔ donorUid` link.
- `donorRef` field accessible only to `Storage` and `Admin` roles.

### 5.11 Stale Stock Guard
- If Storage confirms "Fulfill from Stock" but physical scan is not completed
  within 10 minutes, the `Stock_Reserved` reservation expires and the system
  automatically triggers Mode B (Camp mobilization).
- Late scan confirmation after Mode B is active: rejected with
  `FALLBACK_MODE_B_ACTIVE` error to prevent double-fulfillment.

---

## 6. Requirements — Phase 4 (Planned: Blood Drives & Demand Directive Bot)

### 6.1 Blood Drive Scheduler
- Camp Coordinator creates drive events: date, location, quota targets.
- Donors view upcoming drives and RSVP for 15-minute arrival slots.
- Live tally during drive day: `Units Collected: X / Target Y`.

### 6.2 Storage-to-Camp Demand Directive Bot
- Storage sets safety par levels per blood group and component.
- When inventory drops below par, bot pushes Drive Target Directive to Camp
  Coordinator dashboard.
- Directive specifies which blood groups and how many units are needed.

### 6.3 Bulk Batch Submission
- End of drive: Coordinator taps "Submit Drive Batch to Storage".
- System generates Batch Transfer Manifest (e.g., `Batch #SRM-DRIVE-OCT26`).
- Storage receives manifest, clicks "Receive Batch in Quarantine".
- After lab testing: "Bulk Certify TTI Safe" populates active inventory with
  individual bag barcodes.

### 6.4 Donor Impact Tracker
- After a unit is certified and transfused, donor's app updates:
  "Your unit #SRM-0842 was certified and safely transfused at SRM Hospital."

---

## 7. Out of Scope (Confirmed)
- Payment / billing.
- SMS gateway (requires TRAI DLT registration and per-message cost).
- Public-facing recipient self-service portal.
- Full laboratory information system (centrifuge tracking, bench machine
  integration).
- Live physical temperature sensors for cold-chain monitoring.

---

## 8. Regulatory Context
- Drugs and Cosmetics Rules 1945, Schedule F, Part XII-B (Apheresis statutory
  limits).
- DGHS Transfusion Medicine Technical Manual (MoHFW).
- NACO / NBTC Guidelines.
- India DPDP Act 2023: no persistent background GPS tracking; ephemeral
  client-side distance calculation only; store `distanceKm` (float), never
  raw coordinates.
- Firebase App Check for bot mitigation on public endpoints.

---

*Baseline Version:* v1.0 — 2026-10-27
*Source:* Synthesized from `CAP-23_FDD.md`, `CAP-23_Implementation_Decisions_Log.md`,
`CAP-23_Deviation_Log.md`, and the conversation design sessions.
