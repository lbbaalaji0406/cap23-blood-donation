# FDD — Functional Design Document
## CAP-23 · Blood Donation Management

**Domain:** Healthcare
**Status:** v1.1 — Locked, incorporates D-001 and D-002
**Last updated:** 2026-07-08

---

## 1 · Business Problem
Match donors to recipients with verification and donation history.

## 2 · Actors

- **Donor** — Registers self, views own donation history and current request status (read-only), adds comments/attachments to their own records only. Cannot see other donors' data.
- **Camp Coordinator** — Registers/verifies/matches donors, progresses requests through the workflow, scoped strictly to their own assigned camp (see §3 and D-002). Cannot manage users, masters, or close/mark-unfulfillable requests.
- **Admin** — Full system owner. Manages masters, users (including assigning each Coordinator's camp), has sole authority to move a request to `Closed` or `Unfulfilled`, sees all camps, generates system-wide reports.

**Recipient** is *not* a login-bearing actor. Recipient identity (name, blood group needed, hospital) is captured as data fields on the Donation Request. (Locked decision — see conversation log.)

## 3 · Universal Roles (RBAC)

| Role | Maps to | Scope | Key permissions |
|---|---|---|---|
| **Admin** | Admin | System-wide, all camps | Full CRUD on masters, users, all transactions; sole authority on Closed/Unfulfilled; assigns `campId` to Manager accounts at creation |
| **Manager** | Camp Coordinator | **Own camp only** (D-002) | Create/verify/match/mark-donated on requests where `request.campId == own.campId`; read-only on masters; cannot set status to Closed or Unfulfilled |
| **User** | Donor | Own records only | Create own profile, view own request status + history, comment/attach on own records; no access to other donors' data |

**D-002 enforcement note:** Manager accounts must have `campId` set as a **required** field at creation — Admin's user-creation form must not allow saving a Manager with no camp assigned.

## 4 · Screens (per v6 manual §6)

1. Login / Signup
2. Dashboard (role-scoped: Admin sees all camps, Manager sees own camp only)
3. Masters List (Blood Group, Camp, Hospital) — Admin full CRUD, Manager read-only
4. Masters Create / Edit — Admin only
5. Donation Request List — filtered by campId for Manager, unfiltered for Admin
6. Donation Request Create / Edit
7. Donation Request Detail (status timeline + comments + attachments + audit tab)
8. Reports (Summary / Status / Activity — camp-scoped for Manager, system-wide for Admin)
9. Users — Admin only; includes campId assignment field for Manager accounts
10. Roles — Admin only
11. Settings — Admin only

## 5 · Workflow (includes D-001)

| # | State | Entered by | Valid from | Notes |
|---|---|---|---|---|
| 1 | **Registered** | Manager, Admin | — (initial) | Request logged |
| 2 | **Verified** | Manager, Admin | Registered | Donor eligibility confirmed |
| 3 | **Matched** | Manager, Admin | Verified | Compatible donor linked; atomic write required (see TDD §5, race-condition guard) |
| 4 | **Donated** | Manager, Admin | Matched | Donation completed, units logged |
| 5 | **Closed** | **Admin only** | Donated | Terminal — case fully resolved |
| 6 | **Unfulfilled** (D-001) | **Admin only**, triggered by Manager flag | Registered **or** Verified only | Terminal — no eligible donor could be found. Not reachable from Matched/Donated. |

No skip transitions. No backward transitions. Both terminal states (`Closed`, `Unfulfilled`) require Admin confirmation — same separation-of-duty rule for both.

## 6 · Functional Acceptance Criteria

- [ ] Each actor can perform their listed responsibilities and no others
- [ ] All workflow transitions (including Unfulfilled) are enforced server-side via Firebase security rules, not client-only checks
- [ ] Manager access is strictly camp-scoped (D-002) — verified by attempting cross-camp access and confirming denial
- [ ] Only Admin can set status to Closed or Unfulfilled
- [ ] Trainer Extension implemented: **Donor History**
- [ ] All 3 universal reports generated correctly: Summary Report, Status Report, Activity Report
- [ ] Every status change writes a corresponding `/auditLogs` entry
- [ ] Application deployed to Firebase Hosting with public URL

## 7 · Out of Scope (v1)

- Payment/billing
- SMS gateway (EmailJS only, and only if genuinely needed)
- Public-facing recipient self-service portal (Recipient is data-only, not a login actor)
- Blood bank inventory/stock management (this is request matching, not inventory)
- Donor-attempt-level rejection tracking (evaluated and dropped — see conversation log; request-level Unfulfilled state covers the real gap without this added complexity)

## 8 · Governance Cross-Reference

This FDD incorporates three logged deviations from the original 5-state brief and one clarification of an underspecified requirement:
- **D-001** — Added `Unfulfilled` terminal state (see `CAP-23_Deviation_Log.md`)
- **D-002** — Camp-scoped RBAC for Manager role (see `CAP-23_Deviation_Log.md`)
- **D-003** — Cloudinary replaces Firebase Storage for Attachments (see `CAP-23_Deviation_Log.md`)
