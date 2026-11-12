# DECISIONS.md
## CAP-23 · Blood Donation Management — Agreed Design Decisions

> [!NOTE]
> This file records design decisions agreed with the user and their rationale.
> Decisions sourced from existing logs reference their original ID.
> New decisions made through the `project-design-gate` skill are added here.
> Existing decisions from `CAP-23_Implementation_Decisions_Log.md` and
> `CAP-23_Deviation_Log.md` are preserved below — do not overwrite them.

---

## Existing Decisions (from CAP-23_Implementation_Decisions_Log.md)

These are summarized here for cross-reference. Full rationale is in the
source file.

| ID | Decision | Rationale |
|---|---|---|
| ID-001 | Hard delete with reference guards | Prevents dangling FK references |
| ID-002 | All master references are dropdowns, not free text | Prevents typos and broken matching |
| ID-003 | campId auto-inherited for Manager at request creation | Prevents bypass of camp isolation at creation time |
| ID-004 | campId immutable after creation | Prevents post-hoc orphaning of requests |
| ID-005 | status hardcoded to `Registered` at creation | Prevents fabricated state history |
| D-001 | Added `Unfulfilled` terminal state | No valid exit path for permanently unfulfillable requests |
| D-002 | Camp-scoped RBAC for Manager | Without it, Manager could access all camps |
| D-003 | Cloudinary replaces Firebase Storage for attachments | Firebase Storage billing and CORS complexity |

---

## New Decisions (Design Gate Sessions — 2026-10-27)

### DEC-001: Clinical Reframe of Critical Tier
**Decision:** Live donors mobilized for Critical requests are Urgent Stock
Replenishment, not immediate trauma supply.
**Rationale:** Every donated unit in India requires mandatory TTI testing
(HIV, HBV, HCV, Syphilis, Malaria) taking 90–120 minutes minimum. Acute
trauma is met from certified cold storage using Massive Transfusion Protocol
and emergency O-negative inventory.
**Impact:** Critical timers recalibrated to replenishment scale (10m
aggregation, 30–45m response, 1–2h arrival). Dual-Absorption policy now
clinically sound (STAT unit from storage + replenishment unit from live donor).

### DEC-002: Dynamic Open Standby Pool (not a single fixed backup)
**Decision:** Standby for Critical requests is a live, open pool
(`/standby_pools/{requestId}/`) accepting new volunteers continuously until
case closes. No single person is pre-designated Standby.
**Rationale:** A fixed single Standby is a second single point of failure.
An open pool allows the algorithm to always select the closest available
person at the moment of Primary failure.

### DEC-003: In-Transit Commitment Shield
**Decision:** Once Primary taps "On My Way", they are protected from
cancellation while driving.
**Rationale:** Cancelling a donor who has already left their workplace erodes
trust and reduces future response rates. Dual-Absorption policy handles the
edge case where a closer donor appears while Primary is in transit.

### DEC-004: Inventory Path Convention
**Decision:** Blood unit inventory lives at `inventory/units/{unitId}`, not
under `masters/`.
**Rationale:** `masters/` is reference/configuration data. Inventory is
high-churn transactional data and must not be collocated with static master
records.

### DEC-005: TTI Certification is Immutable
**Decision:** Once a unit is marked `Certified`, it can only move forward.
No un-certify operation exists.
**Rationale:** Un-certifying a blood unit that may already have been issued
to a hospital creates an audit gap and potential patient safety risk.
Discarding is the only valid response to a post-certification defect
discovery.

### DEC-006: Storage Actor Authority Scope
**Decision:** Only Admins can create `Storage` role accounts. The
`certifyStorageUnit` Cloud Function requires `role === 'Storage'` or
`role === 'Admin'` custom claims.
**Rationale:** Marking a unit safe for transfusion is the highest-stakes
action in the system. It requires the same provisioning authority as Admin.

### DEC-007: Server-Side Distance Computation
**Decision:** Client transmits coarse coordinates; Cloud Function computes
Haversine distance using trusted hospital coordinates from
`masters/hospital/{hospitalId}`.
**Rationale:** Client-reported `distanceKm: 0.1` is trivially spoofable
(same class as D-007 in the existing security log). Server must verify.
Hospital coordinates must be added to `masters/hospital`.

### DEC-008: Standby Pool and Public Volunteers as Top-Level Nodes
**Decision:** `/standby_pools/{requestId}/{donorUid}` and
`/public_volunteers/{requestId}/{volunteerId}` are separate top-level RTDB
nodes, not nested under `/matches/{requestId}/`.
**Rationale:** Existing `handleUpdateStatus` and `RequestDetail.tsx` iterate
every child of `/matches/{requestId}/` as a donor UID. Nesting pool data
there would cause the match-clearing logic to attempt writes to
`active_donor_matches/standby_pool` — a data corruption bug.

### DEC-009: Single Scheduling Mechanism (Cloud Tasks)
**Decision:** Google Cloud Tasks (`onTaskDispatched`) is used for all
timer-based operations in both production and local emulator.
No separate polling daemon for local dev.
**Rationale:** Divergent dev/prod scheduling paths produce a class of bug
where local tests pass but production behavior differs. One mechanism
eliminates the gap.

### DEC-010: FCM Requires Staging Project
**Decision:** FCM Web Push verification requires a real staging Firebase
project. It cannot be emulator-only.
**Rationale:** There is no local FCM emulator. This breaks the "never deploy"
guardrail used so far. Staging project must be created before Phase 2
implementation begins.

### DEC-011: Red-Cell Substitution is Advisory Only
**Decision:** Inventory engine suggests compatible alternatives; never
auto-allocates. Storage Officer must explicitly approve substitution.
**Rationale:** Automatically filling O-negative for an O-positive request
depletes the universal donor reserve, harming future emergency response
capability.

### DEC-012: Plasma Compatibility is Rh-Independent and ABO-Inverted
**Decision:** Implemented. `getCompatibleDonorGroups(recipientId, 'Plasma')`
uses inverted ABO matrix with no Rh filtering.
**Rationale:** Plasma is acellular; Rh antigens reside on RBC membranes only.
ABO compatibility for plasma is the inverse of RBC (AB = universal plasma
donor, O = universal plasma recipient).

### DEC-013: Compatibility Matrix Must Have a Single Source of Truth
**Decision:** A parity test (`test-compatibility-parity.mjs`) must assert
that client (`src/services/masterService.ts`) and Cloud Functions
(`functions/src/index.ts`) produce identical outputs for all 8 blood groups
and 3 component types.
**Rationale:** Two separate copies of a medical decision matrix will diverge
over time without a test enforcing identity.

---

## Deliberation Decisions (Antigravity + Claude Opus 5.5 — 2026-11-09)

### DEC-014: Ghost-Inventory Prevention & `ISSUE_UNCONFIRMED`
**Decision:** When a 10-minute scan timer times out, unconfirmed units transition to `ISSUE_UNCONFIRMED` (quarantined from reallocation) instead of returning to `Certified`. Mode B is triggered in parallel. If a late scan arrives, it is accepted with `lateScan: true`.
**Rationale:** If the lab tech has already pulled the physical bag for trauma, marking it as available on the shelf creates "Ghost Inventory" where a second patient is allocated a missing bag. Reality trumps software state.

### DEC-015: Lab-Confirmed Forward/Reverse Grouping & Maker-Checker
**Decision:** Bag barcodes require certified forward and reverse ABO/Rh typing entered during lab screening. Self-reported profile blood groups are never printed onto issue bags. `certifyStorageUnit` enforces `enteredBy.uid !== certifiedBy.uid`.
**Rationale:** ABO incompatibility is the leading cause of fatal hemolytic transfusion reactions. Two-person verification prevents clerical transposition errors.

### DEC-016: Split-Node PII Ledger (`/inventory_donor_ledger/`)
**Decision:** `donorRef` is isolated into `/inventory_donor_ledger/{unitId}` readable only by `Admin` and `Storage`. Hospital ward accounts receive a projected view at `/hospital_issues/{hospitalId}/{issueId}` with zero donor identifiers.
**Rationale:** Preserves vein-to-vein auditability while adhering to DPDP Act 2023 data minimization and the HIV Act 2017.

### DEC-017: Blood Storage Centre (BSC) vs Collection Facility Routing
**Decision:** The hospital master schema adds `hasCollectionLicense: boolean` and `collectionFacilityId: string`. Live donors are routed only to facilities licensed to draw blood.
**Rationale:** Many hospitals hold only storage licenses (fridges) and cannot bleed walk-in donors. Routing donors to a BSC facility is useless during an emergency.

### DEC-018: Anti-DoS Public SOS Pledges
**Decision:** Public volunteer submissions to `/public_volunteers/{requestId}` never decrement `unitsNeeded`. Only a physical phlebotomy barcode scan decrements need. Public submissions are capped at `3 × unitsNeeded`.
**Rationale:** Prevents denial-of-service attacks where automated scripts or malicious users pledge attendance to trick the system into standing down real donors.

### DEC-019: Zero Mid-Transit Driving Notifications (Sec 184 MVA)
**Decision:** Once a donor taps `[On My Way]` and enters `EN_ROUTE`, all in-app countdowns and prompts cease. The dead-man timer is a silent server-side watchdog.
**Rationale:** Distracting a driver on Indian roads violates Section 184 of the Motor Vehicles Act and creates severe liability.

### DEC-020: Server-Side Atomic Allocation Saga
**Decision:** Move inventory reservation from client-side `storageService.ts` to a Cloud Function (`reserveStockUnits`) that locks units with a `reservationId`.
**Rationale:** Eliminates the concurrency race condition where two officers or requests reserve the exact same physical unit simultaneously.

### DEC-021: Targeted RSVP Invitations for Deficit Par Directives
**Decision:** Safety par deficits trigger targeted push notifications to registered donors of that specific blood group, rather than general open camp quotas.
**Rationale:** Walk-in donors mirror population distributions (B+ and O+ dominant). General camps cannot fulfill specific rare or negative unit quotas without targeted invitations.

### DEC-022: Donor Impact Tracker Privacy Sanitization
**Decision:** Donor notifications are sanitized to: *"Your donation #SRM-042 was certified and safely transfused in [City]"*. Never displays hospital ward, diagnosis, or "discarded" status.
**Rationale:** Protects recipient privacy and complies with NACO guidelines preventing un-counseled disclosure of reactive serology.

### DEC-023: Deny Direct Client Writes on Inventory (`.write: false`)
**Decision:** Enforce `.write: false` on `/inventory/**` in `database.rules.json`. Unit intake is handled strictly by `intakeStorageUnit` Cloud Function, stamping `enteredBy = auth.uid` in `Quarantined`.
**Rationale:** Closes security gap B-1 where clients could directly write `status: 'Certified'` or forge `enteredBy` to bypass maker-checker.

### DEC-024: Server-Side 30-Minute Return Validation Callable
**Decision:** Unit return validation moves to `processUnitReturn` Cloud Function using server-recorded dispatch timestamps and component-specific limits (thawed FFP cannot be re-shelved; RBC <= 10°C).
**Rationale:** Closes gap M-1 preventing clients from manipulating return timestamps on local device clocks.

### DEC-025: Dual-State Scan Confirmation (`Stock_Reserved` + `ISSUE_UNCONFIRMED`)
**Decision:** `confirmBarcodeDispatch` accepts bag barcodes if status is either `Stock_Reserved` or `ISSUE_UNCONFIRMED` (with `lateScan: true`).
**Rationale:** Closes gap M-2 ensuring physical reality is accepted if a staff member scans a bag after the 10-minute timeout.

### DEC-026: Universal Routing Engine for All Dispatch Tiers
**Decision:** `domain/routing.ts` applies licensed collection facility routing to Routine, Urgent, and Critical tiers.
**Rationale:** Closes gap M-3 ensuring donors in any tier are never sent to Blood Storage Centres lacking phlebotomy licenses.


### DEC-027: Dual-Door Entrance (Donor vs Institutional Staff) with Emulator Quick-Demo Switcher
**Decision:** `LoginScreen.tsx` presents a clean Two-Door Portal (Voluntary Donor Portal vs Institutional Staff & Clinical Portal). In development and local emulator environments (`import.meta.env.DEV`), a prominent Evaluator Quick-Access bar provides 1-click persona switching (Cold Storage Officer, Hospital Staff, Camp Manager, Universal Donor, System Admin, Intake Tech).
**Rationale:** Solves evaluator and stakeholder demonstration friction while strictly preserving production clinical boundaries.

### DEC-028: Hospital Tenant Isolation Rule Patch (`hospitalId` Immutability)
**Decision:** `database.rules.json` line 8 enforces `newData.child('hospitalId').val() == data.child('hospitalId').val()` on self-updates and `!newData.child('hospitalId').exists()` on user self-signup.
**Rationale:** Closes a tenant isolation vulnerability identified by Claude Code where a hospital worker could theoretically mutate their own `hospitalId` to access a rival hospital's confidential blood requisitions. Verified with automated regression tests (`test-hospital-id-isolation.mjs`).

### DEC-029: Role-Based Deep Routing (`roleHome`) on Authentication
**Decision:** Upon successful authentication, the application inspects the authoritative `users/{uid}/role` profile in RTDB and automatically routes users directly to their primary operational home (`/storage` for Storage Officers, `/hospital/new` for Hospital Staff, `/requests` for Camp Coordinators, `/dashboard` for Admin/Donors).
**Rationale:** Eliminates manual navigation overhead for clinical operators and prevents race-condition redirects on slow profile loading.
