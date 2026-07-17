# CAP-23 Workflow & RBAC State Diagram

This document illustrates the complete lifecycle of a **Donation Request** as defined in `CAP-23_FDD.md`, detailing the 6 primary states (including the Deviation D-001 `Unfulfilled` terminal state), the required transitions, and the specific actors authorized to execute them.

## Master Workflow Diagram

```mermaid
flowchart TD
    %% Define visual styles mapped to UI Spec Tailwind colors
    classDef initial fill:#f59e0b,stroke:#b45309,color:#fff,stroke-width:2px;
    classDef verified fill:#06b6d4,stroke:#0891b2,color:#fff,stroke-width:2px;
    classDef matched fill:#6366f1,stroke:#4f46e5,color:#fff,stroke-width:2px;
    classDef donated fill:#10b981,stroke:#059669,color:#fff,stroke-width:2px;
    classDef closed fill:#64748b,stroke:#475569,color:#fff,stroke-width:2px;
    classDef unfulfilled fill:#ef4444,stroke:#dc2626,color:#fff,stroke-width:2px,stroke-dasharray: 5 5;
    classDef pending fill:#fef08a,stroke:#ca8a04,color:#854d0e,stroke-width:1px,stroke-dasharray: 3 3;

    %% Workflow Nodes
    Start([New Request]) --> Reg(Registered):::initial
    
    %% Primary Happy Path
    Reg -->|1. Verify Request Details<br>Manager / Admin| Ver(Verified):::verified
    Ver -->|2. Check 90-Day Donor Eligibility & Match<br>Manager / Admin| Mat(Matched):::matched
    Mat -->|3. Log Volume<br>Manager / Admin| Don(Donated):::donated
    Don -->|4. Finalize & Sign-off<br><b>Admin Only</b>| Clo(Closed):::closed
    
    %% D-001 Unfulfilled Branch
    Reg -.->|Declare Case Dead<br><b>Admin Only</b>| UF(Unfulfilled):::unfulfilled
    Ver -.->|Declare Case Dead<br><b>Admin Only</b>| UF(Unfulfilled):::unfulfilled
    
    %% Terminals
    Clo --> Finish([End])
    UF --> Finish([End])
```

## Role-Based Access Control (RBAC) Enforcement Summary

* **Manager (Camp Coordinator):**
  * Allowed to move a request through `Registered` → `Verified` → `Matched` → `Donated`.
  * Structurally blocked from modifying requests that do not match their assigned `campId`.
  * Cannot finalize a request directly. They can only transition `Donated` requests into a queue for Admin closure, or flag early-stage requests as `Unfulfillable`.
* **Admin:**
  * Has global, system-wide authority across all camps.
  * Holds **exclusive database write access** to transition any request into the terminal `Closed` or `Unfulfilled` states, enforcing a rigorous separation-of-duty.
* **User (Donor):**
  * Read-only visibility into their assigned matched requests via their Dashboard. No authority to alter workflow states.
