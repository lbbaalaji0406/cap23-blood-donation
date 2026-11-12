# FEATURE_DECISIONS.md
## CAP-23 · Transfusion Ecosystem — Feature Traceability Record

> [!NOTE]
> Every feature requested by the user must appear in this table.
> Status must be one of: Preserved | Modified (with justification) |
> Deferred (with justification) | Proposed for removal (user decision required).
> This file is updated by the `project-design-gate` skill during DESIGN
> DELIBERATION. Do not change statuses without recording justification.

---

## Phase 1 — Core Application (Built & Verified)

| Feature | Status | Notes |
|---|---|---|
| Role-Based Access Control (Admin, Manager, Donor, Hospital) | ✅ Preserved | All 4 roles implemented and security-rule enforced |
| Workflow state machine (Registered → Verified → Matched → Donated → Closed) | ✅ Preserved | No skip/backward transitions; Admin-only terminal states |
| `Partially Matched` state for multi-donor fulfillment | ✅ Preserved | Status returns to Partially Matched until all units collected |
| `Unfulfilled` terminal state (D-001) | ✅ Preserved | Admin-only, from Registered or Verified only |
| Camp-scoped RBAC for Manager (D-002) | ✅ Preserved | Enforced in security rules and Cloud Functions |
| Component-aware compatibility matrix (WholeBlood, Plasma, Platelets) | ✅ Preserved | Implemented in both client and Cloud Functions |
| Plasma Rh-independence and inverted ABO compatibility | ✅ Preserved | AB = universal plasma donor, O = universal plasma recipient |
| Transfusion cooldown matrix (DGHS/NACO) | ✅ Preserved | 14/14 automated tests passing |
| Cross-component cooldown deferrals | ✅ Preserved | WB↔Apheresis 28d, Platelets 7d, etc. |
| Hospital two-way sync (`/hospital_requests`) | ✅ Preserved | Atomic dual-write on all status changes |
| Audit logging (`/auditLogs`) | ✅ Preserved | Every status change logged with actor UID and timestamp |
| Donor PII isolation from Hospital views | ✅ Preserved | Hospital sees progress/status, never donor identity |
| Multi-donor matching (match additional donors when partially fulfilled) | ✅ Preserved | Manager can re-match after each Donated event |
| Direct "Record Donation" action per matched donor row | ✅ Preserved | Implemented in RequestDetail.tsx |
| Universal donor search (not camp-scoped) for matching | ✅ Preserved | All eligible donors visible across all camps |
| Priority queue sorting in RequestList (Critical → Urgent → Routine) | ✅ Preserved | Implemented with urgency weight sort |
| Emergency badge (pulsing CRITICAL, amber URGENT) in RequestList | ✅ Preserved | Implemented in RequestList.tsx |

---

## Phase 2 — Tiered Dispatch & Transit Bot (Planned)

| Feature | Status | Notes |
|---|---|---|
| Routine dispatch: FIFO seniority queue (24h SLA, 1-to-1) | ⏳ Preserved — Deferred | Phase 2 implementation |
| Urgent dispatch: All-matching donor broadcast + FCFS atomic claiming | ⏳ Preserved — Deferred | Phase 2; requires FCM staging project |
| Critical dispatch: 10-minute aggregation + server-side proximity ranking | ⏳ Preserved — Deferred | Phase 3; DEC-001 reframes as replenishment |
| Server-side Haversine distance computation (hospital coords in masters) | ⏳ Preserved — Deferred | Required before Critical proximity ranking |
| Dynamic open Standby Pool (`/standby_pools/{requestId}`) | ⏳ Preserved — Deferred | Separate top-level node per DEC-008 |
| In-Transit commitment shield (Primary cannot be cancelled after "On My Way") | ⏳ Preserved — Deferred | Phase 3 |
| Dual-Absorption policy (collect from both Primary and closer new donor) | ⏳ Preserved — Deferred | Phase 3; clinically sound after DEC-001 reframe |
| Dead-Man's Timer (Primary ETA + grace buffer) with auto-promotion of Standby | ⏳ Preserved — Deferred | Phase 3; Cloud Tasks (`onTaskDispatched`) |
| In-App Transit Tracker Bot (Primary/Standby dashboard card) | ⏳ Preserved — Deferred | Phase 2 |
| FCM Web Push as primary notification channel | ⏳ Preserved — Deferred | Requires staging project (DEC-010) |
| Email downgraded to async confirmation receipt | ⏳ Preserved — Modified | Email was previously primary; now secondary. Rationale: Gmail relay too slow for emergency SLAs |
| Stage-2 All-Hands Community SOS Appeal | ⏳ Preserved — Deferred | Phase 3; requires human authorization gate |
| SOS WhatsApp sharing (all donors including incompatible groups) | ⏳ Preserved — Deferred | Phase 3 |
| HMAC-signed, time-limited SOS public URL | ⏳ Preserved — Deferred | Phase 3; 2-hour auto-expiry or on fulfillment |
| Zero-friction self-attestation (no phone number) | ⏳ Preserved — Deferred | Phase 3; App Check bot mitigation |
| `/public_volunteers/{requestId}` as top-level node | ⏳ Preserved — Deferred | DEC-008; not under `/matches/` |
| RTDB cleanup job for public_volunteer records | ⏳ Preserved — Deferred | Phase 3 |
| Firebase App Check for public SOS endpoint | ⏳ Preserved — Deferred | Phase 3; replaces IP rate limiting |
| Idempotent timeout evaluation via RTDB transaction | ⏳ Preserved — Deferred | Phase 2 |

---

## Phase 3 — Central Storage Inventory (Planned)

| Feature | Status | Notes |
|---|---|---|
| Storage actor role (`Storage`) | ⏳ Preserved — Deferred | Phase 3; Admin-only provisioning |
| Inventory schema at `inventory/units/{unitId}` | ⏳ Preserved — Deferred | NOT under `masters/` per DEC-004 |
| Full status lifecycle (Quarantined→Certified→Reserved→Dispatched→Transfused/Discarded/Expired/Returned) | ⏳ Preserved — Deferred | Phase 3 |
| Per-preservative shelf life (CPDA-1: 35d, SAGM: 42d, Platelets: 5d, FFP temp-dependent) | ⏳ Preserved — Deferred | Phase 3; shelf life stored per unit |
| FEFO (First-Expired, First-Out) allocation engine | ⏳ Preserved — Deferred | Phase 3 |
| Color-coded expiry countdown badges in Storage dashboard | ⏳ Preserved — Deferred | Phase 3 |
| Platelet 24h wastage alert | ⏳ Preserved — Deferred | Phase 3 |
| Mode A fulfillment (Stock_Reserved → Dispatched → Closed) | ⏳ Preserved — Deferred | Phase 3 |
| 10-minute physical barcode scan confirmation timer | ⏳ Preserved — Deferred | Phase 3 |
| Automatic Mode B fallback on scan timeout | ⏳ Preserved — Deferred | Phase 3 |
| `certifyStorageUnit` Cloud Function (immutable, audit-logged) | ⏳ Preserved — Deferred | Phase 3; DEC-005, DEC-006 |
| Red-cell substitution: advisory only, officer must approve | ⏳ Preserved — Deferred | Phase 3; DEC-011 |
| Donor-to-bag traceability (bagBarcode ↔ donorUid, Storage/Admin only) | ⏳ Preserved — Deferred | Phase 3 |
| 30-minute return rule with cold-chain attestation | ⏳ Preserved — Deferred | Phase 3; manual attestation, app records timestamps |
| Late scan guard (reject scan if Mode B already activated) | ⏳ Preserved — Deferred | Phase 3 |
| Compatibility parity test (client vs functions matrix) | ⏳ Preserved — Deferred | DEC-013; prerequisite for Phase 3 |

---

## Phase 4 — Blood Drives & Demand Directive Bot (Planned)

| Feature | Status | Notes |
|---|---|---|
| Blood Drive Scheduler (Coordinator creates drives with quota targets) | ⏳ Preserved — Deferred | Phase 4 |
| Donor Drive RSVP (15-minute arrival slot booking) | ⏳ Preserved — Deferred | Phase 4 |
| Live drive day tally (Units Collected: X / Target Y) | ⏳ Preserved — Deferred | Phase 4 |
| Storage-to-Camp Demand Directive Bot (par-level deficit → camp quota) | ⏳ Preserved — Deferred | Phase 4 |
| Bulk Batch Manifest submission (Coordinator → Storage) | ⏳ Preserved — Deferred | Phase 4 |
| Bulk TTI certification of drive batch | ⏳ Preserved — Deferred | Phase 4 |
| Donor Impact Tracker ("Your unit was transfused at X Hospital") | ⏳ Preserved — Deferred | Phase 4 |

---

## Phase 1 Extension — Authentication & Portal Architecture (Built & Verified)

| Feature | Status | Notes |
|---|---|---|
| Dual-Door Segmented Portal (Donor vs Staff/Clinical) | ✅ Preserved | Implemented in LoginScreen.tsx |
| Evaluator Quick-Demo Bar (1-Click Persona Switcher) | ✅ Preserved | Gated to dev/emulator mode; includes 6 distinct personas |
| Role-Based Deep Routing (`roleHome`) | ✅ Preserved | Routes Storage to `/storage`, Hospital to `/hospital/new`, Manager to `/requests` |
| `hospitalId` Tenant Isolation Enforcement | ✅ Preserved | Immutability enforced in `database.rules.json`; verified via `test-hospital-id-isolation.mjs` |
| Password Reset Flow (`resetPassword`) | ✅ Preserved | Implemented in `authService.ts` via `sendPasswordResetEmail` |
