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

## Log Summary

| ID | Decision | Day |
|---|---|---|
| ID-001 | Master delete guards (referenced records blocked) | Day 2 |
| ID-002 | Master-referencing fields are dropdowns, not free text | Day 2/3 |
| ID-003 | campId auto-inherited for Manager at creation | Day 3 |
| ID-004 | campId immutable after creation | Day 3 |
| ID-005 | Status hardcoded to Registered at creation | Day 3 |
| ID-006 | Detail screen tab shells built ahead of Day 4 content | Day 3 |
