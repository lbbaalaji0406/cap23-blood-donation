---
name: project-design-gate
description: >-
  Default process for developing significant features and new projects in this
  workspace. Use this skill whenever the user describes a new feature, system,
  or architectural change. It enforces three sequential modes: DISCOVERY
  (discuss and refine requirements), DESIGN DELIBERATION (invoke independent
  design-critic and feature-guardian subagents, resolve objections, produce a
  refined plan), and IMPLEMENTATION (execute only after explicit user approval
  of the exact plan version). Never write application code during DISCOVERY or
  DESIGN DELIBERATION. Never begin IMPLEMENTATION without an explicit approval
  message from the user naming the specific plan version.
---

# Project Design Gate

This skill governs how all significant features and projects are developed in
this workspace. It operates in three sequential modes. Read the current mode
carefully before acting.

---

## MODE 1 — DISCOVERY

**Trigger:** The user describes an idea, feature, or project.

**What to do:**
1. Discuss the idea naturally. Ask clarifying questions about purpose, intended
   users, requirements, constraints, and expected outcomes.
2. Explore alternatives. Challenge questionable assumptions respectfully but
   directly, citing evidence where you have it.
3. Incorporate changes and additional features the user requests throughout the
   discussion.
4. Maintain a persistent record of agreed requirements in `PROJECT_BRIEF.md`
   and agreed decisions in `DECISIONS.md`. Update them as the conversation
   evolves. Do not overwrite existing content without recording the reason.
5. Do NOT write application code, invoke implementation subagents, or start
   any autonomous implementation team.
6. Do NOT move to Mode 2 unless the user explicitly says **"Implement"**.

**Remain in DISCOVERY until the user says "Implement".**

---

## MODE 2 — DESIGN DELIBERATION

**Trigger:** The user says "Implement".

**Critical rule:** Do NOT write application code. Freeze requirements and run
the review cycle first.

### Step 1 — Freeze the Requirements Baseline
- Snapshot the current agreed requirements as the versioned baseline in
  `PROJECT_BRIEF.md`. Label it with a version number and timestamp.
- Record the snapshot version in `DECISIONS.md`.

### Step 2 — Draft the Implementation Plan
- Write a complete proposed implementation plan in `IMPLEMENTATION_PLAN.md`.
  It must include:
  - Architecture, components, modules, data flows, APIs, and database design.
  - Implementation order, dependencies, and file-level responsibilities.
  - Alternatives considered and design trade-offs.
  - All requested features and their current status (Preserved / Modified /
    Deferred / Proposed for removal).
  - Security, privacy, reliability, performance, and cost considerations.
  - Test strategy and measurable completion criteria.
  - Open questions requiring user decision.
- Write the initial feature trace in `FEATURE_DECISIONS.md`: one row per
  requested feature with status Preserved by default.

### Step 3 — Invoke the Design Critic
Invoke the `design-critic` subagent using the `invoke_subagent` tool with
`Workspace: inherit` so it can read the actual project files.

Supply it with:
- The absolute path of `IMPLEMENTATION_PLAN.md`.
- The absolute path of `PROJECT_BRIEF.md`.
- The absolute path of the project root and a summary of the existing codebase
  architecture.
- The instruction: "Review the implementation plan and project brief. Identify
  architectural flaws, security risks, missing requirements, unnecessary
  complexity, failure modes, and better alternatives. Return specific findings
  with severity (BLOCKING / MAJOR / MINOR), evidence, proposed corrections,
  and whether each finding blocks implementation. Do not change any source
  files."

### Step 4 — Invoke the Feature Guardian
Invoke the `feature-guardian` subagent using the `invoke_subagent` tool with
`Workspace: inherit`.

Supply it with:
- The absolute path of `PROJECT_BRIEF.md`.
- The absolute path of `IMPLEMENTATION_PLAN.md`.
- The absolute path of `FEATURE_DECISIONS.md`.
- The instruction: "Audit every feature the user requested against the
  implementation plan. Flag omissions, unjustified removals, scope creep, and
  acceptance criteria that fail to represent the user's requirements. Require
  strong technical evidence before recommending removal of any requested
  feature. Return a finding per feature with status and justification. Do not
  change any source files."

### Step 5 — Reconcile and Revise
- Read the findings returned by both reviewers.
- Record all findings, objections, and responses in `REVIEW_LOG.md` under a
  numbered review round (e.g., "Round 1").
- Revise `IMPLEMENTATION_PLAN.md` and `FEATURE_DECISIONS.md` in response to
  valid criticisms.
- Mark each finding as: Resolved / Partially resolved / Rejected (with
  justification) / Escalated to user.

### Step 6 — Second Review Round
- Re-invoke both reviewers with the revised plan.
- Ask them explicitly: "Have the blocking objections from Round 1 been
  resolved? Identify any new issues introduced by the revision."
- Record Round 2 in `REVIEW_LOG.md`.

### Step 7 — Up to Three Rounds
- Repeat for a maximum of three substantive review rounds.
- Stop earlier if all blocking issues are resolved.
- If a material disagreement remains after three rounds, escalate to the user
  with a clear statement of the unresolved conflict and the options.

### Step 8 — Requirements Preservation Check
Before presenting the final plan, verify that every requested feature is
accounted for in `FEATURE_DECISIONS.md` with one of these statuses:
- **Preserved** — Included in the plan as requested.
- **Modified** — Changed, with justification provided and user informed.
- **Deferred** — Out of scope for this iteration, with justification and a
  plan for when it will be addressed.
- **Proposed for removal** — Only with strong evidence (incompatibility,
  serious security risk, technical impossibility, or disproportionate cost).
  Must be presented to the user for decision. Personal preference is not
  sufficient justification.

Never silently remove, weaken, or replace a requested feature.

### Step 9 — Present the Refined Plan for Approval
Present the refined plan to the user. The presentation must include:
1. Architecture, components, modules, data flows, APIs, and database design.
2. Implementation order, dependencies, and file-level responsibilities.
3. Alternatives considered and important design trade-offs.
4. All requested features and their current status.
5. Every proposed feature removal or modification and its evidence-based
   justification.
6. Security, privacy, reliability, performance, and cost considerations.
7. Test strategy, measurable completion criteria, and remaining risks.
8. Unresolved questions that need the user's decision.

Then ask:
> **"Do you approve this plan (version X)? I will not begin implementation
> until you explicitly approve this exact version."**

**Do not begin implementation. Wait for an explicit approval message.**

---

## MODE 3 — IMPLEMENTATION

**Trigger:** The user explicitly approves a named plan version (e.g., "I
approve version 3 of the plan").

**Pre-flight checks (perform before writing any code):**
1. Confirm the working directory is the actual project root containing the
   `.git` folder and the latest application source.
2. Run `git status` to verify the current state of uncommitted changes.
3. Confirm the approved plan version matches the current `IMPLEMENTATION_PLAN.md`.

**Implementation rules:**
- Use the approved plan and project artifacts as the single source of truth.
- Use focused, non-overlapping implementation tasks.
- After implementing each component, run the relevant tests and verify results
  before proceeding.
- If a material requirement or architecture change becomes necessary during
  implementation, stop and ask the user before continuing.
- Keep human approval mandatory for destructive operations, production
  deployment, and material changes in scope.

**Multi-agent implementation:**
- For substantial multi-file work, consider using `/teamwork-preview` if
  available in this account.
- If Teamwork requires a separate working directory, verify it is based on the
  latest project state and explain how completed changes will be merged back
  into the original project before invoking it.
- Do not ask the user to paste the plan into another conversation. Pass the
  plan file paths directly.

**Completion report:**
When implementation is complete, provide a final report listing:
- Implemented features and their test results.
- Remaining issues or deviations from the approved plan.
- Any requested features that were not implemented, with reasons.
- The exact commands used to verify correctness.

---

## Persistent Project Records

Maintain these files throughout all modes. Reuse existing equivalents where
they already exist in the project.

| File | Purpose |
|---|---|
| `PROJECT_BRIEF.md` | Requirements, constraints, versioned baseline snapshots |
| `DECISIONS.md` | Agreed decisions and rationale |
| `IMPLEMENTATION_PLAN.md` | Complete proposed architecture and ordered steps |
| `FEATURE_DECISIONS.md` | Traceable record of every requested feature and status |
| `REVIEW_LOG.md` | Review rounds, objections, responses, unresolved disagreements |
| `ACCEPTANCE_TESTS.md` | Measurable acceptance criteria and required tests |

Do not overwrite existing project documentation without recording the reason
for the change.
