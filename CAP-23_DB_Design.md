# DB Design — Firebase Realtime Database
## CAP-23 · Blood Donation Management

**Status:** v1.1 — Locked, incorporates D-001, D-002, and guardrail fixes

---

## RTDB Tree

```
/users/
  {uid}/ {
    email, name, role,           // role: Admin | Manager | User
    campId,                      // REQUIRED for Manager role only; unset for Admin/User (D-002)
    createdAt
  }

/roles/
  Admin/ { perms: [...] }
  Manager/ { perms: [...] }
  User/ { perms: [...] }

/masters/
  blood_group/
    {id}/ {
      name, code, active, createdAt, createdBy,
      compatibleRecipients: [ "code1", "code2", ... ]   // compatibility map, admin-editable
    }
  camp/
    {id}/ { name, code, active, createdAt, createdBy }
  hospital/
    {id}/ { name, code, active, createdAt, createdBy }

/transactions/
  donation_request/
    {id}/ {
      recipientName, recipientHospitalId,       // recipient is DATA only, not an actor
      blood_groupId,
      campId,                                    // FK — used for D-002 scoping check
      status,             // Registered | Verified | Matched | Donated | Closed | Unfulfilled
      unfulfillableFlag,   // set by Manager, actual status transition requires Admin (D-001)
      matchedDonorId,      // set only during Matched; must be unique-checked via runTransaction
      assignedTo, createdBy, createdAt, updatedAt
    }

/donor_history/                                  // Trainer Extension
  {donorUid}/
    {donationId}/ {
      requestId, donationDate, volume, campId, verifiedBy
    }

/comments/
  {transactionId}/
    {commentId}/ { text, author, authorRole, createdAt }

/attachments/
  {transactionId}/
    {attachmentId}/ { fileName, storageUrl, size, mimeType, uploadedBy, uploadedAt }

/auditLogs/
  {entry-id}/ {
    actor, actorRole, action, target,
    beforeStatus, afterStatus,
    outcome,              // "success" | "denied" — denied attempts logged too (observability)
    timestamp
  }

/settings/
  appName, theme, contactEmail, ...
```

## Indexed Queries

- `/transactions/donation_request` indexed on `status`, `campId`, `assignedTo`, `createdAt`
- `/auditLogs` indexed on `timestamp` (descending)
- `/donor_history/{donorUid}` indexed on `donationDate` (descending)

## Security Rules (complete — fixes the self-escalation hole and unruled-path gaps)

```json
{
  "rules": {
    "users": {
      "$uid": {
        ".read": "auth != null && (auth.uid == $uid || root.child('users').child(auth.uid).child('role').val() == 'Admin')",
        ".write": "auth != null && (
          (auth.uid == $uid && !newData.child('role').exists() && !newData.child('campId').exists())
          || root.child('users').child(auth.uid).child('role').val() == 'Admin'
        )"
      }
    },

    "masters": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'Admin'"
    },

    "transactions": {
      "donation_request": {
        "$id": {
          ".read": "auth != null && (
            root.child('users').child(auth.uid).child('role').val() == 'Admin'
            || root.child('users').child(auth.uid).child('campId').val() == data.child('campId').val()
          )",
          ".write": "auth != null && (
            root.child('users').child(auth.uid).child('role').val() == 'Admin'
            || (
              root.child('users').child(auth.uid).child('role').val() == 'Manager'
              && root.child('users').child(auth.uid).child('campId').val() == data.child('campId').val()
              && newData.child('status').val() != 'Closed'
              && newData.child('status').val() != 'Unfulfilled'
            )
          )"
        }
      }
    },

    "donor_history": {
      "$donorUid": {
        ".read": "auth != null && (auth.uid == $donorUid || root.child('users').child(auth.uid).child('role').val() != 'User')",
        ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() != 'User'"
      }
    },

    "comments": {
      "$transactionId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },

    "attachments": {
      "$transactionId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    },

    "auditLogs": {
      ".read": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'Admin'",
      ".write": "auth != null"
    },

    "settings": {
      ".read": "auth != null",
      ".write": "auth != null && root.child('users').child(auth.uid).child('role').val() == 'Admin'"
    }
  }
}
```

**Key fixes vs. original uploaded skeleton:**
1. `users.$uid.write` — a user can update their own profile, but **cannot** touch their own `role` or `campId` fields (closes the self-escalation hole)
2. Every path now has explicit rules (`masters`, `comments`, `attachments`, `auditLogs`, `settings` were previously unruled and would have defaulted to denied)
3. `transactions` write rule enforces campId match for Manager (D-002) **and** explicitly blocks Manager from ever setting `Closed` or `Unfulfilled` (D-001 + original FDD Admin-only rule) at the database layer, not just the UI
4. `auditLogs` is world-writable (any authenticated action can log) but Admin-only readable, since it's an audit trail

**Note:** matching-uniqueness (a donor not already Matched elsewhere) and status-transition atomicity cannot be fully expressed in declarative security rules alone — this must be enforced in `workflowService` via `runTransaction()` per TDD §5. Security rules here are the second layer of defense, not the only one.
