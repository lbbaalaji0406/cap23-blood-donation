# Deviation Log — Governance Compliance Record
## CAP-23 · Blood Donation Management

**Purpose:** This log records every point where the build knowingly departs from either (a) the original brief's stated workflow (`Registered → Verified → Matched → Donated → Closed`) or (b) the uploaded governance template documents (CAP-23_FDD.md, CAP-23_Test_Plan.md, CAP-23_UI_Specs.md, CAP-23_TDD.md, CAP-23_DB_Design.md). Per Lead instruction: *"Stick to governance rules documents attached to make sure that we don't deviate"* — any deviation must be explicit, justified, and approved here before implementation.

---

## Deviation D-001: Additional terminal workflow state — `Unfulfilled`

**Status:** ✅ Approved by Lead — 2026-07-08

**What deviates:**
The original brief and all uploaded governance documents specify exactly 5 workflow states with a single terminal state (`Closed`, reachable only via `Donated`). This build adds a 6th state, `Unfulfilled`, as a second terminal state.

**Why (the gap this closes):**
Under the strict 5-state model, a Donation Request for which no eligible/compatible donor can ever be found has no valid state to transition into. It permanently remains in `Registered`, indistinguishable in Status Reports from a freshly-created, untouched request. Admin has no mechanism to formally close a case that cannot be fulfilled. This is a structural dead end, not a missing nice-to-have.

**Scope of the change (deliberately minimal):**
- One new value added to the existing `status` field — no new nested data structures.
- One new state, `Unfulfilled`.
- Reachable **only** from `Registered` or `Verified`.
- **Not** reachable from `Matched` or `Donated` (once a real match exists, this scenario no longer applies).
- **Trigger:** Camp Coordinator (Manager role) flags a request as unfulfillable after exhausting the donor search.
- **Confirmation authority: Admin only** — mirrors the existing Admin-only `Closed` authority pattern already established in the FDD, preserving separation-of-duty (the person searching is not the person declaring the case dead).

**What was explicitly considered and rejected:**
A more granular "donor-attempt Rejected" model was evaluated (tracking every individual failed donor candidate as a structured, nested record per request). Rejected because:
1. The core workflow does not require it — a Coordinator can already move on to the next candidate donor using comments alone, with no functional blocker.
2. It would require new nested DB schema, a new UI list component, and additional report logic not present in any governance template — cost disproportionate to benefit for a 5-day build.
3. The single `Unfulfilled` state addresses the one genuine structural gap (no exit path) without this added complexity.

**Impact on governance documents (to be applied when each doc is populated):**

| Document | Section | Required edit |
|---|---|---|
| FDD | §5 Workflow | Add `Unfulfilled` entry: entered by Admin, triggered by Coordinator flag, valid from Registered or Verified only |
| Test Plan | §3 Workflow Transition Tests | Add valid transitions (Registered→Unfulfilled, Verified→Unfulfilled) and invalid transitions (Matched/Donated→Unfulfilled; Coordinator setting Unfulfilled without Admin confirmation) |
| UI Specs | §3 Status Pills | Add `Unfulfilled` color mapping; Detail screen status-transition action gains one Admin-gated option |
| DB Design | `status` enum / Security Rules | Add `Unfulfilled` to enum comment; write rule restricting `status=Unfulfilled` to Admin role only |
| TDD | `workflowService` | Add two new valid transition edges + Admin-only guard condition |

**Approved by:** OrchestrAI Lead
**Recorded by:** Twin (AI Co-Engineer)
**Date:** 2026-07-08

---

## Deviation D-002: Camp-scoped RBAC for Manager (Camp Coordinator) role

**Status:** ✅ Approved by Lead — 2026-07-08

**Classification note:** Unlike D-001, this is not a deviation from an explicit brief statement — the brief never states camp-scoping as a requirement. This is better classified as **completing an implied link between two elements the brief already mandates** (see below), rather than a departure from stated spec.

**What was there (uploaded governance, as-is):**
`/users/{uid}` stores only `email, name, role, createdAt` — no camp association. The security rule skeleton grants any Manager-role account write access to **every** Donation Request system-wide:
```
".write": "auth != null && (role == 'Admin' || role == 'Manager')"
```

**Why this is a gap, not just a stylistic choice:**
1. `Camp` is one of the 3 mandatory Masters in the original brief. `Camp Coordinator` is one of the 3 mandatory Actors. The brief already implies these are linked (a coordinator coordinates *a* camp) — the uploaded schema simply never wired the connection.
2. `donation_request` already carries a `campId` foreign key (per uploaded DB Design) — the missing piece is only on the user side.
3. Without scoping, any Camp Coordinator can read/write any camp's requests system-wide — a real data-isolation gap in a healthcare-adjacent system, and a direct exposure point for the RBAC rubric line (15 pts) and the Guardrails pillar of OGE.

**Resolution:**
- Add `campId` to `/users/{uid}` — populated for Manager-role accounts only; irrelevant/unset for Admin.
- Admin assigns a Coordinator's `campId` at account-creation time (Administration / User Management module) — consistent with Admin owning all master and user setup.
- Security rule updated so Manager write access requires **both**: `role == 'Manager'` **and** the target request's `campId` matches the actor's own `campId`.
- Admin role is unaffected — Admin write access remains unconditional and system-wide by design, since Admin is the one role explicitly meant to operate across all camps.

**Impact on governance documents (to be applied when each doc is populated):**

| Document | Section | Required edit |
|---|---|---|
| FDD | §2/§3 Actors/RBAC | Note Camp Coordinator (Manager) scope is limited to their assigned camp |
| DB Design | `/users/{uid}` schema | Add `campId` field |
| DB Design | Security Rules | Rewrite Manager `.write` condition to include camp-match check |
| TDD | `useRBAC(action)` / `workflowService` | Scope checks must compare actor's `campId` against target request's `campId` for Manager role |
| Test Plan | §4 RBAC Tests | Add: "Manager cannot read/write a Donation Request belonging to a different camp" |

**Approved by:** OrchestrAI Lead
**Recorded by:** Twin (AI Co-Engineer)
**Date:** 2026-07-08

---

## Deviation D-003: Cloudinary replaces Firebase Storage for Attachments

**Status:** ✅ Approved by Lead — 2026-07-08

**What deviates:**
The master prompt's tech stack explicitly states: *"Firebase v12: Authentication, Realtime Database, Storage, Hosting."* This build replaces **Storage only** with **Cloudinary**. Authentication, Realtime Database, and Hosting remain Firebase as originally specified — this deviation is scoped to file/attachment storage exclusively.

**Why:**
As of February 3, 2026, Firebase requires all projects (new and existing) to be on the pay-as-you-go Blaze billing plan to provision or maintain access to any Cloud Storage bucket — this is a platform-wide policy change that post-dates the original master prompt, not a project-specific issue. This requires linking a credit card, even though actual usage would likely stay within free quotas. Cloudinary's free plan provides no-card-required file storage (25GB via their Assets DAM free tier, or 25 monthly credits via their Image/Video API free tier) that fully covers this project's Attachments module needs (medical reports, ID proofs) without any billing account dependency.

**What actually changes (scoped, contained):**
- The Attachments module's upload/storage destination changes from Firebase Storage to Cloudinary's API.
- The `attachments` node's `storageUrl` field now holds a Cloudinary-hosted URL instead of a `firebasestorage.app` URL. **The field name and overall schema shape are unchanged** — `{ fileName, storageUrl, size, mimeType, uploadedBy, uploadedAt }` stays exactly as originally specified in DB Design.
- The TDD's `storageService` now wraps Cloudinary's upload API (signed uploads recommended, so an unauthenticated client cannot push arbitrary uploads without a valid signed request from the app's own service layer) instead of the Firebase Storage SDK.
- Type/size validation guards on upload (already specified in the original TDD for `storageService`) apply identically — this requirement doesn't change, only which platform enforces it.

**What does NOT change:**
- Auth, RTDB, and Hosting remain Firebase exactly as originally specified — do not substitute these.
- Everything else in DB Design's RTDB tree, security rules, and all other services (`authService`, `workflowService`, `reportService`) is unaffected.
- Firebase's `/attachments/{transactionId}/{attachmentId}` RTDB node still exists and still stores attachment *metadata* — only the actual file bytes move to Cloudinary instead of Firebase Storage. RTDB is not storing files directly either way; it never did.

**Note on Firebase Hosting — unaffected, and not yet due:**
This deviation does not touch Hosting. Per the Day tracker, Hosting deployment is a **Day 5** item ("Deployed to Firebase Hosting — live public URL"), not Day 1. There is nothing to deploy yet — Day 1 scope only sets up the project and reserves the Hosting URL; the actual `firebase deploy` step correctly comes later, once there's a real built app to serve. No action needed on Hosting right now.

**Approved by:** OrchestrAI Lead
**Recorded by:** Twin (AI Co-Engineer)
**Date:** 2026-07-08

---

## Deviation D-004: Minimal Users/campId-assignment slice pulled forward from Day 5 to Day 2

**Status:** ✅ Approved by Lead — 2026-07-09

**What deviates:**
The master prompt's 5-day build plan places Administration (Users, Roles, Settings) entirely on Day 5, under "Reports · RBAC · Deployment · Documentation." This build implements a **minimal slice** of the Users module — viewing users, and setting role + campId on a user — on **Day 2**, ahead of schedule.

**Why:**
Day 2's Dashboard component (per Day 2 scope) must be verified as correctly camp-scoped for the Manager role — this requires at least one real Manager account, with a real assigned `campId`, created through the app's own logic (not a one-off manual RTDB edit in the Firebase Console). Without this slice, the only way to create a second test account with Manager role is repeating the same manual console bootstrap used once, deliberately, for the very first Admin account (see project setup notes) — which is an acceptable one-time exception for bootstrapping the first Admin, but not a sound way to repeatedly test Manager-scoped features going forward.

**Scope of the pulled-forward slice (deliberately minimal — this is NOT the full Day 5 Administration module):**
- View list of all users with current role/campId
- Set a user's `role` and `campId` (Admin-only action, already covered by the existing deployed security rule's Admin-bypass clause)
- Required-field validation: `campId` must be set when role is "Manager," selected from the live Camp master (dropdown, not free text)

**What stays on Day 5, unchanged:**
- Roles screen (viewing/editing the `perms` arrays under `/roles`)
- Settings screen
- Full Users module polish (search, filtering, deactivation of user accounts, etc.)
- Formal end-to-end RBAC matrix verification across the complete, finished app

**Impact on Day tracker:**
Day 5's "RBAC matrix complete — Admin, Manager, User permissions enforced everywhere" checkbox should be treated as **partially pre-satisfied** by this slice — Day 5 work on this line becomes verification/completion, not first implementation, of the user-role-assignment piece specifically.

**Approved by:** OrchestrAI Lead
**Recorded by:** Twin (AI Co-Engineer)
**Date:** 2026-07-09

---

## Deviation D-005: Restructure Donation Request to campId-in-Path

**Status:** ✅ Approved by Lead — 2026-07-14

**What deviates:**
The original flat structure for transactions (`/transactions/donation_request/{requestId}`) implied by the governance DB schema has been restructured into a hierarchical path: `/transactions/donation_request/{campId}/{requestId}`.

**Why:**
Firebase RTDB security rules evaluate from the top down. A flat list structure requires a root-level `.read` rule to fetch the list. If that rule is restricted using `data.child('campId')`, it evaluates against individual records, but Firebase rejects the entire query at the root level (`permission_denied`) because rules cannot filter data—they only secure access to known paths. To achieve strict, natively-secured read isolation for Managers (Camp Coordinators) without `permission_denied` errors during list queries, the `campId` must be embedded in the path so the `.read` rule can explicitly grant access to `/transactions/donation_request/$campId`.

**Scope of the change:**
- **DB Rules:** Restructured to isolate `.read` and `.write` by `$campId` natively. Removed legacy `campId` immutability clause, as `campId` is now structural.
- **Data Migration:** Moved existing records from the flat structure to the nested structure via a one-time Admin SDK script.
- **App Service:** Refactored `requestService.ts` to re-attach `campId` to objects dynamically upon fetch.
- **Routing:** Updated `RequestsRouter` and UI components to require `/:campId/:requestId` in paths.

**Impact on governance documents:**
| Document | Section | Required edit |
|---|---|---|
| DB Design | `/transactions/donation_request` schema | Update schema path to include `{campId}` level. |
| DB Design | Security Rules | Replace flat rules with hierarchical `$campId` rules for strict isolation. |

**Approved by:** OrchestrAI Lead
**Recorded by:** Twin (AI Co-Engineer)
**Date:** 2026-07-14

---

## Log Summary

| ID | Deviation | Status |
|---|---|---|
| D-001 | Add `Unfulfilled` terminal workflow state | ✅ Approved |
| D-002 | Camp-scoped RBAC for Manager (Camp Coordinator) role | ✅ Approved |
| D-003 | Cloudinary replaces Firebase Storage (Attachments only) | ✅ Approved |
| D-004 | Minimal Users/campId slice pulled forward from Day 5 to Day 2 | ✅ Approved |
| D-005 | Restructure Donation Request to campId-in-Path for Manager read-isolation | ✅ Approved |
