# Test Plan
## CAP-23 · Blood Donation Management

**Status:** v1.1 — Locked, incorporates D-001, D-002, and guardrail fixes

---

## 1 · Test Strategy

- **Unit tests** — pure functions (workflow validator, report formatters)
- **Integration tests** — RTDB read/write paths via Firebase Emulator, including concurrent-write scenarios
- **Smoke tests** — end-to-end click-through on deployed URL

## 2 · Module Coverage Matrix

| Module | Unit | Integration | Smoke |
|---|---|---|---|
| Authentication       | ✓ | ✓ | ✓ |
| Dashboard            |   | ✓ | ✓ |
| Master Data          | ✓ | ✓ | ✓ |
| Transactions         | ✓ | ✓ | ✓ |
| **Workflow Engine**  | ✓ | ✓ | ✓ |
| Donor History        | ✓ | ✓ | ✓ |
| Comments             |   | ✓ | ✓ |
| Attachments          | ✓ | ✓ | ✓ |
| Reports              | ✓ | ✓ |   |
| Administration / RBAC | ✓ | ✓ | ✓ |

## 3 · Workflow Transition Tests (highest-weight category — 20 pts)

**Valid transitions:**
- ✓ Registered → Verified
- ✓ Verified → Matched
- ✓ Matched → Donated
- ✓ Donated → Closed *(Admin only)*
- ✓ Registered → Unfulfilled *(Admin only, D-001)*
- ✓ Verified → Unfulfilled *(Admin only, D-001)*
- ✓ Terminal: Closed (cannot transition further)
- ✓ Terminal: Unfulfilled (cannot transition further)

**Invalid transitions:**
- ✗ Any non-adjacent transition (e.g. skip a state)
- ✗ Backwards transition (unless explicitly allowed)
- ✗ Matched → Unfulfilled, Donated → Unfulfilled (Unfulfilled only valid from Registered/Verified)
- ✗ Manager attempting to set status directly to Closed or Unfulfilled (Manager may only set `unfulfillableFlag`; Admin performs the actual transition)

**Concurrency / race-condition tests (new — guardrail fix):**
- ✗ Two simultaneous Manager writes attempting to match different donors to the same request — verify only one succeeds, second is rejected (not silently overwritten), via `runTransaction()`
- ✗ Attempt to Match a donor already `Matched` on another open request — verify rejection, atomic check
- ✓ Verify denied/failed transition attempts still write an `auditLogs` entry with `outcome: "denied"`

## 4 · RBAC Tests

- **User role:** can create own profile, view own request status/history, comment/attach on own records; cannot access other users' data; cannot delete masters
- **Manager role:** can create/verify/match/mark-donated within own camp; **cannot** read or write a Donation Request belonging to a different `campId` (D-002); cannot set status to Closed or Unfulfilled directly; cannot manage users or masters (read-only on masters)
- **Admin role:** full access across all camps; sole authority on Closed/Unfulfilled; can assign `campId` to Manager accounts; user-creation form must reject saving a Manager account with no `campId` set

**Security-rule-specific tests (new — guardrail fix):**
- ✗ A User attempting to write their own `role` or `campId` field directly — must be rejected at the Firebase rules layer (self-escalation hole fix)
- ✓ Every RTDB path (`masters`, `comments`, `attachments`, `auditLogs`, `settings`) has an explicit, non-default rule — verify none rely on Firebase's default-deny by omission
- ✗ Manager attempting to read a Donation Request outside their `campId` — verify denial at the rules layer, not just hidden in UI

## 5 · Smoke Test Checklist (run after every deploy)

1. Sign in as Admin
2. Create one of each master (including Blood Group compatibility map entries)
3. Create a Manager account, assign a `campId` — confirm form blocks save with no campId
4. Sign in as that Manager, create a Donation Request
5. Walk it through: Registered → Verified → Matched → Donated
6. Sign back in as Admin, transition Donated → Closed
7. Create a second Donation Request as Manager, flag as unfulfillable, confirm Admin can transition Registered → Unfulfilled
8. Attempt (as Manager) to access a Donation Request from a different camp — confirm denied
9. Add a comment + attach a file
10. Generate each of the 3 reports (Manager: camp-scoped; Admin: system-wide)
11. Check Donor History reflects the completed donation with correct eligibility countdown
12. Sign out, sign in as User (Donor), confirm RBAC blocks all restricted actions

## 6 · Acceptance

All checks pass = ready to submit for OrchestrAI Lead Certification review.
