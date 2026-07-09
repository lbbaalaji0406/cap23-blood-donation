# TDD — Technical Design Document
## CAP-23 · Blood Donation Management

**Status:** v1.1 — Locked, incorporates D-001, D-002, and guardrail fixes

---

## 1 · Tech Stack

- React 19 + React Router 7 + TypeScript 6
- Tailwind v4 + Lucide React
- Firebase v12 (Auth + RTDB + Hosting) & Cloudinary (Attachments)
- EmailJS (only if a transactional email is genuinely needed)
- Vite 8 (Rolldown bundler)

## 2 · Component Tree

```
App
├── AuthProvider
├── AppShell (Sidebar + Header, role-aware nav)
│   ├── Dashboard                          (role-scoped: Admin=all camps, Manager=own camp)
│   ├── Masters/
│   │   ├── BloodGroupList → BloodGroupForm    (Admin CRUD, includes compatibility map)
│   │   ├── CampList → CampForm                 (Admin CRUD)
│   │   ├── HospitalList → HospitalForm          (Admin CRUD)
│   ├── Transactions/
│   │   ├── DonationRequestList             (campId-filtered for Manager)
│   │   ├── DonationRequestForm
│   │   └── DonationRequestDetail
│   │       ├── StatusTimeline               (6 states incl. Unfulfilled)
│   │       ├── CommentsThread
│   │       └── AttachmentsList
│   ├── DonorHistory/                        (Trainer Extension)
│   │   └── DonorHistoryView                 (eligibility countdown, past donations)
│   ├── Reports/
│   │   ├── SummaryReport
│   │   ├── StatusReport
│   │   └── ActivityReport
│   └── Admin/
│       ├── Users                            (campId assignment field, required for Manager)
│       ├── Roles
│       └── Settings
```

## 3 · Custom Hooks

- `useAuth()` — current user, role, campId
- `useRTDB<T>(path)` — generic RTDB read/write with loading states
- `useRBAC(action)` — gate UI elements by role **and** campId match (D-002)
- `useWorkflowTransition(requestId)` — wraps `workflowService`, exposes valid next-states only

## 4 · State Strategy

- React Context: current user, role, campId
- Local component state for forms
- RTDB as system-of-record; no Redux

## 5 · Services

### `authService`
Firebase Auth wrappers (sign in/up/out, session persistence).

### `storageService`
Attachment upload to Cloudinary API with type/size guards (signed uploads recommended).

### `workflowService` — CRITICAL, race-condition guardrail required

All status-changing writes (especially `Matched`, and both terminal states) **must use Firebase `runTransaction()`, not plain `set()`/`update()`**. This is a hard requirement, not a style preference:

```javascript
// REQUIRED pattern for status transitions and donor-matching:
await runTransaction(statusRef, (currentStatus) => {
  if (!isValidTransition(currentStatus, newStatus, actorRole)) {
    return undefined; // abort transaction, no write occurs
  }
  return newStatus;
});
```

Reason: plain `update()` calls allow two concurrent writers (e.g., two Coordinators on the same camp) to silently overwrite each other's transition — the second write wins with no error and no audit trace. `runTransaction()` performs an atomic check-against-server-value before committing.

**Additionally required:** donor-matching must verify, within the same transaction, that the target donor is not already `Matched` on another open request — this guard was specified in the original FDD but needs explicit atomic enforcement here, not just a pre-check.

Transition rules encoded here:
- No skip transitions, no backward transitions
- `Matched → Donated → Closed`: Closed requires `actorRole == 'Admin'`
- `Registered/Verified → Unfulfilled`: requires `actorRole == 'Admin'` (Manager can only *flag*, stored as a separate `unfulfillableFlag` field Manager can set — Admin transitions the actual status)
- All rejected/invalid attempts should still log to `/auditLogs` with the attempted (denied) action, for observability

### `reportService`
Excel + PDF generation, camp-scoped filtering for Manager role.

## 6 · OGE Hooks

- **Observability:** `auditLogs/{entry-id}` written on every write attempt (success **and** denied attempts) — actor, action, target, beforeStatus, afterStatus, timestamp
- **Guardrails:** `workflowService` validates every status change server-side via Firebase rules (not client-only); `runTransaction()` enforced on all status/match writes; RBAC checks include campId match, not just role
- **Evaluation:** smoke test script in `/scripts` runs against deployed URL per Test Plan §5

## 7 · Git / Commit Discipline

Per master prompt build discipline — **one commit per validated component**, never squashed, never bulk. A "component" boundary, for commit purposes, means:

- Each individual screen/form (e.g., `LoginScreen`, `SignupScreen` = 2 separate commits, not 1)
- Each master's CRUD set (e.g., `BloodGroupList + BloodGroupForm` = 1 commit)
- Each service file, once validated (`workflowService`, `storageService`, etc. = 1 commit each)
- Each Firebase security rule addition/change = its own commit (security rules are high-risk enough to warrant isolated, reviewable diffs)

Push to GitHub at end of each day (per Day tracker). Final `v1.0.0` tag on Day 5 after full smoke test passes.
