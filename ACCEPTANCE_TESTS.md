# ACCEPTANCE_TESTS.md
## CAP-23 · Transfusion Ecosystem — Acceptance Criteria & Tests

> [!NOTE]
> This file defines measurable acceptance criteria for each milestone.
> All automated test commands must be runnable and return a pass/fail result.
> Manual verification steps must be specific enough for a person unfamiliar
> with the codebase to execute independently.

---

## Phase 1 — Core Application (Currently Built)

### AT-001: Component Compatibility Matrix
**Criterion:** All 8 blood groups × 3 component types return correct compatible
donor groups for both client and Cloud Functions implementations.
```powershell
cmd.exe /c "node test-compatibility-parity.mjs"
```
**Expected:** 24/24 test cases pass. Client and functions outputs are identical.

### AT-002: Transfusion Cooldown Matrix
**Criterion:** All DGHS/NACO statutory cooldown rules are enforced correctly.
```powershell
cmd.exe /c "npm run test:cooldowns"
```
**Expected:** 14/14 tests pass.

### AT-003: Plasma Inversion
**Criterion:** O+ plasma recipient is compatible with all 8 donor groups.
AB+/AB- plasma recipient is compatible only with AB+/AB-.
```powershell
cmd.exe /c "node -e \"const { getCompatibleDonorGroups } = require('./functions/lib/index.js'); const r = getCompatibleDonorGroups('O_plus', 'Plasma'); console.log(r.length === 8 ? 'PASS' : 'FAIL: ' + JSON.stringify(r));\""
```

### AT-004: Camp-Scoped Access (Manager)
**Manual:** Log in as `manager2@example.com`. Attempt to access a request
belonging to `CAMP001`. Verify access is denied (403 or empty result).

### AT-005: Admin-Only Terminal States
**Manual:** Log in as `manager1@example.com`. Open a Donated request.
Verify that `Closed` and `Unfulfilled` buttons are not present.
Log in as `admin@example.com`. Verify both buttons are available.

### AT-006: Dual-Write Sync
**Manual:** Create a request as Hospital (`hospital1@example.com`). Verify
the same request appears in both `/transactions/donation_request/CAMP001/`
and `/hospital_requests/HOS001/` in the Firebase Emulator UI.

### AT-007: Multi-Donor Partial Fulfillment
**Manual:** Create a 2-unit request. Match Donor 1 and record donation.
Verify status returns to `Partially Matched`. Match Donor 2 and record
donation. Verify status moves to `Donated`.

### AT-008: Audit Log Completeness
**Manual:** Run a full request lifecycle (Registered → Verified → Matched →
Donated → Closed). Verify that 5 audit log entries exist in
`/auditLogs/{requestId}/` with correct actor UIDs and timestamps.

---

## Milestone 1 — Storage Inventory Core

### AT-101: Compatibility Parity
```powershell
cmd.exe /c "node test-compatibility-parity.mjs"
```
**Expected:** All 24 cases pass. Error if client and functions diverge.

### AT-102: FEFO Allocation Order
**Automated:** Script creates 3 certified A+ PRBC units expiring in 2, 10,
and 30 days. Requests 1 unit. Verifies the 2-day unit is allocated first.
```powershell
cmd.exe /c "node test-fefo-allocation.mjs"
```

### AT-103: Immutable Certification
**Automated:** Certify a unit. Attempt to call `certifyStorageUnit` again
on the same unit. Verify it returns an error and the unit remains Certified.
```powershell
cmd.exe /c "node test-certify-immutability.mjs"
```

### AT-104: 10-Minute Fallback to Mode B
**Manual (Emulator):** Create a Registered request. Storage clicks "Fulfill
from Stock". Unit enters `Stock_Reserved`. Wait for the Cloud Task to fire
(or trigger manually in emulator). Verify request moves to `Verified` and
Camp Coordinator receives a Mode B alert. Verify unit returns to `Certified`.

### AT-105: Storage Role Scope
**Manual:** Log in as a `Storage` account. Verify access to
`inventory/units`. Verify no access to other users' profiles or `users/`
collection outside own UID. Verify cannot set status to `Closed` or
`Unfulfilled` on donation requests.

### AT-106: Late Scan Guard
**Manual:** Trigger Mode B fallback (AT-104). Immediately attempt to
complete the physical barcode scan for the originally reserved unit.
Verify the response is `FALLBACK_MODE_B_ACTIVE` and no double-fulfillment
occurs.

---

## Milestone 2 — Notification & Urgent Dispatch

### AT-201: FCM Web Push Delivery (Staging)
**Manual (Staging Project):** Submit an Urgent request. Verify that all
compatible donors receive a Web Push notification within 5 seconds.
Verify email is NOT the delivery trigger.

### AT-202: FCFS Atomic Claiming
**Automated:** Script simulates 3 concurrent `claimUrgentSlot` calls on a
1-unit Urgent request. Verifies exactly 1 succeeds and 2 receive
`ALREADY_CLAIMED` response.
```powershell
cmd.exe /c "node test-urgent-fcfs-concurrency.mjs"
```

### AT-203: Routine FIFO Order
**Manual:** Seed 3 donors with different last-donation dates. Trigger a
Routine request. Verify the donor with the oldest last-donation date is
matched first.

### AT-204: 24-Hour Routine Timeout
**Manual (emulator accelerated):** Create a Routine match. Trigger the
Cloud Task timeout manually. Verify donor lock is released and next FIFO
candidate is offered the match.

---

## Milestone 3 — Critical Dispatch & Community SOS

### AT-301: Server-Side Distance Ranking
**Automated:** Script registers 3 simulated donors with different distances.
Verifies that after the 10-minute aggregation window, the donor with
`min(distanceKm)` is promoted to Primary.
```powershell
cmd.exe /c "node test-critical-proximity-ranking.mjs"
```

### AT-302: Standby Pool Open Until Closure
**Manual:** Create a Critical request. Wait for Primary assignment. Register
a new donor in the standby pool at T+8 minutes (after aggregation window).
Trigger Primary failure. Verify the new donor (if closest) is promoted to
Primary.

### AT-303: Dual-Absorption (In-Transit Primary + New Closer Donor)
**Manual:** Primary taps "On My Way". A new closer donor joins Standby Pool.
Verify Primary is NOT cancelled. Verify closer donor is added as additional
collection target (unit count increments).

### AT-304: HMAC-Signed SOS URL Expiry
**Automated:** Generate an SOS URL. Attempt to access it after 2-hour TTL.
Verify it returns `EXPIRED` and the self-attestation form is not accessible.

### AT-305: App Check Bot Mitigation
**Manual:** Attempt to POST to the public_volunteer endpoint without a valid
App Check token. Verify the request is rejected with `UNAUTHORIZED`.

### AT-306: Public Volunteer Cleanup
**Manual:** Complete a Critical request (status: Donated). Verify that all
records under `/public_volunteers/{requestId}/` are cleaned up by the
Cloud Task within a reasonable window.

---

## Non-Functional Acceptance Criteria

| Criterion | Target | How Verified |
|---|---|---|
| Build with zero TypeScript errors | 0 errors | `npm run build` exits 0 |
| Functions build with zero TypeScript errors | 0 errors | `npm --prefix functions run build` exits 0 |
| FCM notification delivery latency | < 5 seconds | Manual timing on staging |
| Cloud Tasks timeout accuracy | ± 30 seconds of specified delay | Emulator and staging observation |
| Atomic RTDB transaction correctness | Zero double-fulfillment in concurrent tests | AT-202, AT-301 |
| No application source modification during setup | Git diff shows no src/ or functions/ changes | `git diff --name-only` |


---

## Phase 1 Extension Acceptance Tests

### AT-SEC-01: Hospital Tenant Isolation Rule Test
**Criterion:** A hospital user cannot mutate their own `hospitalId` to cross into another hospital's tenant scope, and newly registered users cannot self-assign a `hospitalId`.
```powershell
cmd.exe /c "node test-hospital-id-isolation.mjs"
```
**Expected:** 5/5 positive and negative tests pass with HTTP 401 Permission Denied on unauthorized mutations.

### AT-LOGIN-01: Dual-Door Portal & Evaluator Persona Switcher
**Criterion:** Login screen presents distinct Donor Portal and Staff Portal tabs, with an evaluator-gated 1-click persona bar for local emulators. Authentication directly navigates users to their primary operational home (`roleHome`).
```powershell
cmd.exe /c "npm run build"
```
**Expected:** TypeScript and Vite bundle cleanly with zero compilation errors.
