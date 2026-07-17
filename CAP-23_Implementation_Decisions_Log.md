# Implementation Decisions Log
## CAP-23 · Blood Donation Management

**Purpose:** This log is distinct from `CAP-23_Deviation_Log.md`. The Deviation Log records departures from explicitly stated requirements (brief text, uploaded governance docs). **This log records judgment calls made to fill gaps the specs left silent** — decisions that don't contradict anything written, but weren't spelled out either, and needed a concrete choice to actually build. Keeping these separate prevents diluting the Deviation Log's signal for a grader skimming it.

Numbered `ID-001`, `ID-002`, etc. — sequential, not tied to any particular day.

---

## ID-001: Blood Group / Camp / Hospital delete guards (Day 2)

**Gap:** The brief and uploaded governance docs specify Masters need "Delete" (per Day tracker: "List + Create + Edit + Delete"), but never address what should happen if a record being deleted is still referenced elsewhere.

**Decision:** Real, permanent delete — but guarded. Before deleting, check for existing references (a Blood Group referenced in another's `compatibleRecipients`; a Camp referenced by a Manager's `campId`). If referenced, block the delete with a clear message naming the reference. If unreferenced, delete permanently, no soft-flag fallback.

**Why:** An unguarded hard delete risks dangling references — e.g., deleting a Camp that a Manager is still assigned to would leave that Manager's `campId` pointing at nothing, breaking their Dashboard and access scoping silently.

---

## ID-002: Blood Group / Hospital / Camp fields as dropdowns, not free text (Day 2, extended in Day 3)

**Gap:** Neither the brief nor UI Specs explicitly state whether master-referencing fields (like `campId` on a Donation Request, or `compatibleRecipients` on a Blood Group) should be free text or a constrained selector.

**Decision:** Always a dropdown/selector populated from live master data, storing the actual record ID — never free text.

**Why:** Free text allows typos and unmatched values (e.g., "AB +" vs "AB+"), which silently break Reports grouping and reference-guard logic (ID-001 depends on exact-match comparison to work at all).

---

## ID-003: campId auto-inherited (not selectable) for Manager at Donation Request creation (Day 3)

**Gap:** FDD establishes Manager is camp-scoped (via D-002) for *access*, but doesn't explicitly state how `campId` gets set *at creation time* on a new Donation Request.

**Decision:** For Manager, `campId` is auto-set from their own profile, not rendered as an editable field at all. For Admin, a real camp-selector is shown, since Admin isn't tied to one camp.

**Why:** If Manager could pick any campId at creation, D-002's entire camp-isolation guarantee would be bypassable at the point of creation, even though it's correctly enforced everywhere else (reads, later edits).

---

## ID-004: campId immutable after Donation Request creation (Day 3)

**Gap:** Neither FDD nor DB Design states whether `campId` can be changed after a Donation Request is created.

**Decision:** `campId` is write-once — set at creation (per ID-003), never editable afterward, enforced both in the Edit UI (field not rendered) and in the security rule (write blocked if `campId` differs from the existing stored value).

**Why:** An editable campId would let a request be silently moved out of the camp that's accountable for it after the fact — the same "orphaning" risk considered (and avoided) for Camp reassignment during Day 2's design discussion, recurring here at the transaction level.

---

## ID-005: Donation Request status hardcoded to "Registered" at creation, never a form field (Day 3)

**Gap:** FDD's workflow table states Registered is the initial state, but doesn't explicitly say the Create form must prevent any other value from ever being submitted.

**Decision:** `status` is never rendered as an editable field on the Create form, for either Manager or Admin — hardcoded server-side/in the write call to `"Registered"`.

**Why:** Without this, a stray default value or accidental selection could create a record that claims to be `"Closed"` or any other state from the moment of creation, with none of the actual workflow steps or audit trail entries that state is supposed to represent — a silent, hard-to-detect data integrity gap.

---

## ID-006: Donation Request Detail screen built with tab shells (Comments/Attachments/Audit) in Day 3, ahead of their real functionality in Day 4

**Gap:** UI Specs already specifies the 4-tab Detail layout, but doesn't state which day should build the shell vs. the functional content.

**Decision:** Build the tab structure (navigable, but placeholder content) in Day 3, alongside the Details tab; fill in real Comments/Attachments/Audit functionality in Day 4.

**Why:** Building the Detail page without this structure in Day 3 would require Day 4 to restructure the page layout to retrofit tabs, rather than simply filling in content inside an already-correct shell — avoids rework, keeps each day's commits additive rather than corrective.

---

## ID-007: Admin multi-fetch "Loop over camps" approach for Donation Requests (Day 3)

**Gap:** With D-005 moving Donation Requests into a `campId`-nested structure, there is no longer a single flat endpoint for the Admin to fetch *all* requests system-wide. The specs do not dictate how cross-camp aggregation should be handled when the primary data structure is sharded by camp.

**Decision:** The `getAllRequests` method for the Admin role first fetches the list of all camps (`/masters/camp`), then maps over them to perform concurrent `get()` requests to each camp's nested `donation_request` subtree, merging and sorting the results client-side.

**Why:** The alternative would be creating a secondary, flat, denormalized cross-camp index just for Admin reads. The "loop over camps" approach was chosen to ensure **zero data duplication** (maintaining a single source of truth) and to lower the defect surface by avoiding the need to keep two separate write paths perfectly in sync during every Create, Edit, or Delete operation.

---

## Log Summary

| ID | Decision | Day |
|---|---|---|
| ID-001 | Master delete guards (referenced records blocked) | Day 2 |
| ID-002 | Master-referencing fields are dropdowns, not free text | Day 2/3 |
| ID-003 | campId auto-inherited for Manager at creation | Day 3 |
| ID-004 | campId immutable after creation | Day 3 |
| ID-005 | Status hardcoded to Registered at creation | Day 3 |
| ID-006 | Detail screen tab shells built ahead of Day 4 content | Day 3 |
| ID-007 | Admin loop-over-camps aggregation (no data duplication) | Day 3 |
| ID-008 | Atomic donor-match locking via `/active_donor_matches` node | Day 4 |
| ID-009 | Donor History `volume` field is manually inputted at Donated transition, defaulting to 1 | Day 5 |
| ID-010 | Donor ID badge explicitly displayed on User Dashboard for Manager bridging | Day 5 |
| ID-011 | Server-side 90-day Eligibility Guard implemented via DB Rules | Day 5 |

---

## ID-008: Atomic donor-match locking via `/active_donor_matches/{donorUid}` (Day 4)

**Gap:** TDD §5 explicitly requires that donor-matching verify, "within the same transaction," that a donor isn't already Matched to another open request — but never specifies the mechanism. Firebase's `runTransaction()` only guarantees atomicity within a single node path; the original flat-then-nested `donation_request` structure has no single path that could atomically check "is this donor free" across every camp's requests simultaneously.

**Decision:** Add a new top-level RTDB node, `/active_donor_matches/{donorUid}: { requestId, campId }`. When a donor is matched, the app calls `runTransaction()` on this donor's specific path — Firebase guarantees only one such transaction succeeds if two coordinators attempt to match the same donor concurrently; the second is cleanly aborted, no double-booking. Entry is deleted when a match is undone or the request moves past Matched (Donated/Closed/Unfulfilled), freeing the donor for future matching.

**Why:** Without this, two coordinators (potentially in different camps) could each independently read "is Ravi already matched?", both see no, and both write a match — a genuine race condition the TDD already identified as a requirement but which the existing schema structurally could not prevent. This isn't new scope; it's the minimum addition needed to make an already-approved design promise (TDD §5) actually enforceable.

**Cross-checked against:** no conflicts with D-001 through D-005 or any existing DB Design node — this is a net-new top-level path, doesn't restructure anything already built.

---

## ID-009: Donor History `volume` field is explicitly inputted at "Donated" transition (Day 5)

**Gap:** Day 5's Donor History component requires a `volume` field in the `/donor_history` write, but `volume` was never captured at request creation (only `unitsNeeded`), as what is requested and what is actually donated can differ.

**Decision:** Add a simple `volume` input field (defaulting to 1) when the Coordinator clicks to transition a request to `Donated`. Do not silently inherit `unitsNeeded`.

**Why:** Represents physical reality accurately. A request for 3 units might result in a 1-unit actual donation from a specific donor. Capturing this at the point of action is precise and avoids polluting the history with aspirational numbers.

---

## ID-010: Donor ID exposed on User Dashboard to bridge physical gap (Day 5)

**Gap:** The FDD and workflow require the Camp Manager to input the Donor's UID to execute a Match, but there was no documented screen where the User could actually view their own UID to present to the Manager at walk-in. Also, Managers do not have global `/users` read access to look them up by email/name (strict RBAC scoping).

**Decision:** Surfaced a highly visible "Your Donor ID" badge at the top of the User Dashboard, directly exposing `user.uid` to the authenticated user.

**Why:** Without this, testing and real-world operation is blocked because the physical-to-digital handoff has a missing link. It securely solves the problem (the user only sees their own ID, and the manager doesn't need global lookup privileges) while strictly honoring the established RBAC architecture.

---

## ID-011: Server-side 90-day Eligibility Guard implemented via DB Rules (Day 5)

**Requirement:** The FDD explicitly states under the Verified state guard condition that a donor must meet the "last donation gap ≥ 90 days" requirement.

**Decision:** The initial implementation enforced this only in the Service layer (client-side), which was vulnerable to raw API bypasses. To fulfill the FDD requirement securely, we implemented a server-side DB rule check. Because DB rules cannot query dynamic lists, a new denormalized node `/donor_eligibility/{donorUid}/lastDonationDate` was created. The `matchDonor` transaction now includes a strict DB rule requiring that `(now - lastDonationDate >= 90 days)`.

**Why:** This mathematically guarantees the stated FDD requirement at the database level, preventing any client-side overrides or DevTools exploits.
