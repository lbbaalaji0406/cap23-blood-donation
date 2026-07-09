# UI Specs
## CAP-23 · Blood Donation Management

**Status:** v1.1 — Locked, incorporates D-001

---

## 1 · Brand Tokens

- Primary: indigo-500 (#6366f1)
- Accent: purple-600 (#9333ea)
- Surface: slate-50 (light) · slate-900 (dark)
- Radius: rounded-xl (12px) for cards, rounded-lg (8px) for inputs
- Font: Inter (UI), JetBrains Mono (code)

## 2 · Key Screens

### Login / Signup
- Centered card, logo top
- Email + Password fields
- "Sign In" CTA + "Forgot password" link

### Dashboard
- 4 KPI cards top: Total Donation Requests · Pending · This Week · Closed
- **Manager view: KPIs scoped to their own camp only. Admin view: system-wide, with a camp filter/selector.**
- Recent Donation Requests table (10 rows, click → detail)
- Status distribution donut chart (now 6 segments, incl. Unfulfilled)

### Donation Request List
- Filters: status dropdown (6 states) · date range · master filters (Blood Group, Camp, Hospital)
- **Manager's list is pre-filtered to their own campId — no camp filter shown to Manager, since it's not optional for them.** Admin sees full camp filter.
- Table with: id, key fields, status pill, assigned to, created at
- Pagination (50/page)
- "New Donation Request" CTA top-right (Manager/Admin only)

### Donation Request Detail
- Header: id + status pill + actions dropdown (transition status)
- **Status dropdown for Manager shows only: Registered, Verified, Matched, Donated, and a "Flag as Unfulfillable" button (not a direct status set — writes `unfulfillableFlag`, per D-001).**
- **Status dropdown for Admin additionally shows: Close, Confirm Unfulfilled (only enabled when `unfulfillableFlag` is set by a Manager, or Admin can set directly).**
- Tabs: Details · Comments · Attachments · Audit
- Status timeline visualisation (**6 states** — Unfulfilled shown as a branch off Registered/Verified, not inline with the main 5-state flow)

### Donor History (Trainer Extension)
- Timeline of past donations for the logged-in donor (or, for Manager/Admin, any donor within their scope)
- Eligibility countdown badge: "Eligible again in X days" computed from last donation date

### Reports
- Tabs for each report type
- Date range + filter controls
- **Manager's reports auto-scoped to own camp; Admin's have a camp selector (default: all camps)**
- Export buttons: Excel · PDF
- Inline preview table

## 3 · Status Pills (color mapping)

- Registered → amber
- Verified → cyan
- Matched → indigo
- Donated → emerald
- Closed → slate
- **Unfulfilled → rose** *(new — D-001)*

## 4 · Accessibility

- All actions keyboard-reachable
- aria-labels on icon-only buttons
- Color contrast ≥ AA on body text
- Focus rings visible
- Status pills carry text label, not color alone (colorblind-safe — applies to the new Unfulfilled/rose pill too)
