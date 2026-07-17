# CAP-23 System Design & OGE Philosophy

## The OGE Approach
This capstone was built using the **OGE (Observability, Guardrails, Evaluation)** approach to software engineering. Instead of assuming the happy path, OGE dictates that we actively seek structural gaps and enforce rigid boundaries at the lowest possible layer.

### 1. Observability
Visibility into system operations is paramount. During this build, we constructed a robust `auditLogs` system. Rather than just tracking successful status changes, we mandated that **failed state transitions** (like an attempted skip from `Registered` to `Closed`) and **failed race-conditions** (two managers fighting for the same donor) be explicitly logged. 
*Example:* The Activity Report built on Day 5 derives its entire value from this observability, rendering a complete time-bound audit trail for Administrators and Managers.

### 2. Guardrails
A system must structurally reject unauthorized actions, not just hide the buttons in the UI. 
*Example (Guardrails Case Study - D-007):* On Day 4, deliberate exploit testing revealed a cascading Firebase rules bug. The parent `$campId` node had a permissive `.write` rule that allowed a Manager to bypass the strict status-transition matrix enforced at the `$requestId` child node. The UI properly disabled the "Mark as Closed" button, but raw `PATCH` requests succeeded. By applying the Guardrails philosophy, we immediately deleted the parent rule and consolidated all Role, Camp Match, and State Transition validations entirely into the `$requestId` leaf node.

### 3. Evaluation
Continuous testing against the architectural boundary rather than the UI. 
*Example:* We didn't assume the D-007 fix worked; we explicitly ran a raw `PATCH` exploit against the database as a same-camp Manager to verify the backend returned `401 Unauthorized` before proceeding to the final day.

---

## Governance Documentation

This project maintains strict adherence to a suite of **8 distinct governance documents**, proving a heavily disciplined engineering lifecycle:

1. **CAP-23_FDD.md (Functional Design Document):** Details the core workflow, actors (Admin, Manager, User), and functional boundaries.
2. **CAP-23_TDD.md (Technical Design Document):** Defines the technical architecture, React component structure, Vite/Firebase stack, and race-condition locking strategies.
3. **CAP-23_DB_Design.md:** The blueprint for the Firebase Realtime Database schema and core security rule intent.
4. **CAP-23_UI_Specs.md:** The exact specifications for the Tailwind UI, layout components, and modal interactions.
5. **CAP-23_Test_Plan.md:** Outlines the rigorous testing matrices for RBAC, status transitions, and data isolation.
6. **CAP-23_Deviation_Log.md:** Formally records every departure from the original brief.
7. **CAP-23_Implementation_Decisions_Log.md:** Records all gap-fills and technical decisions that didn't contradict the brief but required explicit alignment (e.g., ID-008 Atomic Locks).
8. **Day Build Prompts:** The chronological build specifications that guided the 5-day execution.

---

## Timeline of Major Structural Findings

Throughout the 5-day build, adhering to the OGE philosophy surfaced three critical structural gaps that were identified, diagnosed, and resolved:

* **Day 2 (D-005 - The Read Isolation Gap):** We discovered that Firebase RTDB cannot evaluate child data in a `.read` rule for list queries. We restructured the entire Donation Request schema into a hierarchical path (`/transactions/donation_request/{campId}/{requestId}`) to guarantee strict Manager read-isolation at the database layer.
* **Day 4 (D-006 - The Sub-collection Bypass):** Comments and Attachments were using unguessable push IDs with a blanket `auth != null` rule. We applied strict "Envelope" camp-isolation RBAC to these nodes, actively preventing cross-camp snooping by appending `campId` to every comment/attachment.
* **Day 4 (D-007 - The Cascading Write Vulnerability):** Discovered that the strict transition matrix in the `$requestId` node was being silently bypassed due to a permissive `.write` rule at the `$campId` parent level. Consolidated the entire matrix and role-check into the leaf node to mathematically lock the workflow.
