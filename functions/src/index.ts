import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';

admin.initializeApp();

// Utilities
export const getCompatibleDonorGroups = (recipientBloodGroupId: string): string[] => {
  switch (recipientBloodGroupId) {
    case 'A_plus': return ['A_plus', 'A_minus', 'O_plus', 'O_minus'];
    case 'A_minus': return ['A_minus', 'O_minus'];
    case 'B_plus': return ['B_plus', 'B_minus', 'O_plus', 'O_minus'];
    case 'B_minus': return ['B_minus', 'O_minus'];
    case 'AB_plus': return ['A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus', 'O_plus', 'O_minus'];
    case 'AB_minus': return ['A_minus', 'B_minus', 'AB_minus', 'O_minus'];
    case 'O_plus': return ['O_plus', 'O_minus'];
    case 'O_minus': return ['O_minus'];
    default: return [];
  }
};

const emailjsServiceId = defineSecret('EMAILJS_SERVICE_ID');
const emailjsTemplateId = defineSecret('EMAILJS_TEMPLATE_ID');
const emailjsPublicKey = defineSecret('EMAILJS_PUBLIC_KEY');
const emailjsPrivateKey = defineSecret('EMAILJS_PRIVATE_KEY');

async function sendActivationEmail(uid: string, email: string, name: string, link: string, source: 'admin' | 'self') {
  let subject = '';
  let html = '';

  if (source === 'admin') {
    subject = 'Your Account has been Created';
    html = `Hello ${name},

An administrator has provisioned an account for you on the Blood Donation Platform.

Please activate your account and set your password by visiting the link below:
${link}

Thank you!`;
  } else {
    subject = 'Welcome! Please Verify Your Account';
    html = `Welcome ${name},

Thank you for signing up to the Blood Donation Platform.

To verify your email address, please visit the link below:
${link}

Thank you!`;
  }

  // Hook for testing EmailJS API failure without failing our own validations
  const templateIdToUse = (process.env.FUNCTIONS_EMULATOR === 'true' && email === 'fail-emailjs@example.com') ? 'invalid_template_id' : emailjsTemplateId.value();

  try {
    const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: emailjsServiceId.value(),
        template_id: templateIdToUse,
        user_id: emailjsPublicKey.value(),
        accessToken: emailjsPrivateKey.value(),
        template_params: {
          to_email: email,
          subject,
          donor_name: name,
          message_body: html,
          urgency_label: "ROUTINE",
          urgency_color: "#3498db",
          recipient_name: "",
          blood_group: "",
          hospital: "",
          urgency: "",
          time: new Date().toLocaleString()
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `EmailJS returned status ${response.status}`);
    }
  } catch (error: any) {
    console.error('Failed to send email:', error);
    // Log failure to RTDB without crashing caller
    const failureRef = admin.database().ref('email_failures').push();
    await failureRef.set({
      uid,
      email,
      reason: error.message || 'Unknown EmailJS error',
      timestamp: { '.sv': 'timestamp' }
    });
  }
}

async function sendStatusEmail(uid: string, email: string, name: string, eventType: string, requestDetails: any, campName: string, hospitalName: string, bloodGroupName: string) {
  let subject = '';
  let message_body = '';
  let urgency_label = 'ROUTINE';
  let urgency_color = '#3498db';

  const bloodGroup = bloodGroupName || 'Unknown';
  const hospital = hospitalName || 'Unknown';
  const camp = campName || 'Unknown';
  const recipientName = requestDetails.recipientName || 'Unknown';
  const urgency = requestDetails.urgency || 'Routine';

  if (eventType === 'Matched') {
    if (urgency === 'Critical') {
      subject = "[CRITICAL] Urgent Blood Donation Match ΓÇö Please Respond ASAP";
      urgency_label = 'CRITICAL ΓÇö RESPOND ASAP';
      urgency_color = '#e74c3c';
      message_body = `A critical blood donation match has been found. Your immediate response could save a life. You've been offered a match ΓÇö please respond in the app.`;
    } else if (urgency === 'Urgent') {
      subject = "[URGENT] You've Been Matched ΓÇö Action Needed";
      urgency_label = 'URGENT REQUEST';
      urgency_color = '#e67e22';
      message_body = `An urgent blood donation match has been found. You've been offered a match ΓÇö please respond in the app.`;
    } else {
      subject = "You've Been Matched for a Blood Donation Request";
      urgency_label = 'ROUTINE';
      urgency_color = '#3498db';
      message_body = `Thank you for your willingness to donate blood. You've been offered a match ΓÇö please respond in the app.`;
    }
  } else if (eventType === 'Donated') {
    // Explicitly keeping Donated calming/Routine regardless of original request urgency
    subject = 'Thank You for Your Donation!';
    urgency_label = 'ROUTINE';
    urgency_color = '#3498db';
    message_body = `Your blood donation at ${camp} has been successfully recorded. Your contribution for ${recipientName} (supporting ${hospital}) is deeply appreciated and will go a long way in saving lives.`;
  } else if (eventType === 'Closed') {
    // Explicitly keeping Closed calming/Routine regardless of original request urgency
    subject = 'Donation Request Closed';
    urgency_label = 'ROUTINE';
    urgency_color = '#3498db';
    message_body = `The blood donation request you were matched to for ${recipientName} (supporting ${hospital}) has been closed. Thank you for your readiness to help!`;
  } else {
    throw new Error(`Unknown eventType: ${eventType}`);
  }

  // Hook for testing EmailJS API failure without failing our own validations
  const templateIdToUse = (process.env.FUNCTIONS_EMULATOR === 'true' && email === 'fail-emailjs@example.com') ? 'invalid_template_id' : emailjsTemplateId.value();

  const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: emailjsServiceId.value(),
      template_id: templateIdToUse,
      user_id: emailjsPublicKey.value(),
      accessToken: emailjsPrivateKey.value(),
      template_params: {
        to_email: email,
        subject,
        donor_name: name,
        message_body,
        urgency_label,
        urgency_color,
        recipient_name: recipientName,
        blood_group: bloodGroup,
        hospital,
        camp,
        urgency,
        time: new Date().toLocaleString()
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `EmailJS returned status ${response.status}`);
  }
}

async function safeSendEmailNotification(donorUid: string, eventType: 'Matched' | 'Donated' | 'Closed', campId: string, requestId: string) {
  const db = admin.database();
  try {
    // Step A: Fetch donor profile
    const profileRef = db.ref(`users/${donorUid}`);
    const profileSnap = await profileRef.get();
    
    if (!profileSnap.exists()) {
      await db.ref('email_failures').push().set({ uid: donorUid, eventType, requestId, reason: 'donor profile fetch failed', timestamp: { '.sv': 'timestamp' } });
      return;
    }
    const profile = profileSnap.val();
    if (!profile.email) {
      await db.ref('email_failures').push().set({ uid: donorUid, eventType, requestId, reason: 'donor profile missing email', timestamp: { '.sv': 'timestamp' } });
      return;
    }

    // Step B: Fetch request details
    const requestRef = db.ref(`transactions/donation_request/${campId}/${requestId}`);
    const requestSnap = await requestRef.get();
    
    if (!requestSnap.exists()) {
      await db.ref('email_failures').push().set({ uid: donorUid, eventType, requestId, reason: 'request details fetch failed', timestamp: { '.sv': 'timestamp' } });
      return;
    }
    const requestDetails = requestSnap.val();

    // Step B.5: Fetch Master Data for readable names
    let bloodGroupName = requestDetails.blood_groupId || 'Unknown';
    let hospitalName = requestDetails.recipientHospitalId || 'Unknown';
    let campName = campId || 'Unknown';

    if (requestDetails.blood_groupId) {
      const bgSnap = await db.ref(`masters/blood_group/${requestDetails.blood_groupId}`).get();
      if (bgSnap.exists()) {
        const bgData = bgSnap.val();
        if (bgData.code) bloodGroupName = bgData.code;
      }
    }

    if (requestDetails.recipientHospitalId) {
      const hospSnap = await db.ref(`masters/hospital/${requestDetails.recipientHospitalId}`).get();
      if (hospSnap.exists()) {
        const hospData = hospSnap.val();
        if (hospData.name) hospitalName = hospData.name;
      }
    }

    if (campId) {
      const campSnap = await db.ref(`masters/camp/${campId}`).get();
      if (campSnap.exists()) {
        const campData = campSnap.val();
        if (campData.name) campName = campData.name;
      }
    }

    // Step C: Send Email
    await sendStatusEmail(donorUid, profile.email, profile.name || 'Donor', eventType, requestDetails, campName, hospitalName, bloodGroupName);

  } catch (error: any) {
    // Step D: Log exception silently
    console.error('safeSendEmailNotification failed:', error);
    try {
      await db.ref('email_failures').push().set({
        uid: donorUid,
        eventType,
        requestId,
        reason: error.message || 'Unknown email failure',
        timestamp: { '.sv': 'timestamp' }
      });
    } catch (logErr) {
      console.error('Failed to log email failure to RTDB:', logErr);
    }
  }
}

// Phase 1: Workflow State Transition and Locking Migration
export const processWorkflowState = functions.https.onCall({ secrets: [emailjsServiceId, emailjsTemplateId, emailjsPublicKey, emailjsPrivateKey] }, async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { action, campId, requestId, donorUid } = data;

  if (!action || !campId || !requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required parameters.');
  }

  // Get caller profile
  const callerRef = admin.database().ref(`users/${auth.uid}`);
  const callerSnapshot = await callerRef.get();
  
  if (!callerSnapshot.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }

  const callerProfile = callerSnapshot.val();

  // Validate caller permissions
  if (callerProfile.role !== 'Admin' && callerProfile.campId !== campId) {
    throw new functions.https.HttpsError('permission-denied', 'User does not have access to this camp.');
  }

  if (action === 'MATCH_DONOR') {
    if (!donorUid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing donorUid for MATCH_DONOR action.');
    }
    return await handleMatchDonor(campId, requestId, donorUid, auth.uid, callerProfile.name || 'Unknown');
  } else if (action === 'RESPOND_TO_MATCH') {
    const { response } = data;
    if (!donorUid || !response) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing parameters for RESPOND_TO_MATCH action.');
    }
    return await handleRespondToMatch(campId, requestId, donorUid, response, auth.uid, callerProfile.name || 'Unknown');
  } else if (action === 'UPDATE_STATUS') {
    const { currentStatus, newStatus, donorUid, volume, bloodGroup } = data;
    if (!currentStatus || !newStatus) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing status parameters.');
    }
    return await handleUpdateStatus(campId, requestId, currentStatus, newStatus, auth.uid, callerProfile.name || 'Unknown', donorUid, volume, bloodGroup);
  }

  throw new functions.https.HttpsError('invalid-argument', `Unknown action: ${action}`);
});

async function handleUpdateStatus(campId: string, requestId: string, currentStatus: string, newStatus: string, actorUid: string, actorName: string, donorUid?: string, volume?: number, bloodGroup?: string) {
  const db = admin.database();
  try {
    const rootUpdates: any = {};
    

    if (newStatus === 'Donated' || newStatus === 'Closed' || newStatus === 'Unfulfilled') {
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newStatus;
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
      
      // EXPLICIT LOCK RELEASE: Clear global locks for all donors matched to this request
      const matchesSnap = await db.ref(`matches/${requestId}`).once('value');
      if (matchesSnap.exists()) {
        matchesSnap.forEach(child => {
          const matchDonorUid = child.key as string;
          rootUpdates[`active_donor_matches/${matchDonorUid}`] = null;
        });
      }
      
      if (donorUid && newStatus === 'Donated') {
        rootUpdates[`donor_history/${donorUid}/${requestId}`] = {
          requestId,
          donationDate: { '.sv': 'timestamp' },
          volume: volume || 1,
          campId,
          verifiedBy: actorUid
        };
        rootUpdates[`donor_eligibility/${donorUid}/lastDonationDate`] = { '.sv': 'timestamp' };

        // Verify blood group during donation
        if (bloodGroup) {
          rootUpdates[`users/${donorUid}/bloodGroup`] = bloodGroup;
        }
        rootUpdates[`users/${donorUid}/bloodGroupVerified`] = true;
        rootUpdates[`users/${donorUid}/bloodGroupVerifiedBy`] = actorUid;
        rootUpdates[`users/${donorUid}/bloodGroupVerifiedAt`] = { '.sv': 'timestamp' };
      }
    } else {
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newStatus;
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
    }
    
    await db.ref().update(rootUpdates);
    
    await logAudit(requestId, actorUid, actorName, 'UPDATE_STATUS', 'Success', null, currentStatus, newStatus);
    
    if (donorUid && newStatus === 'Donated') {
      const details = bloodGroup ? `Corrected to ${bloodGroup}` : 'Confirmed as reported';
      await logAudit(requestId, actorUid, actorName, 'VERIFY_BLOOD_GROUP', 'Success', null, undefined, details);
    }
    
    if (donorUid && (newStatus === 'Donated' || newStatus === 'Closed')) {
      await safeSendEmailNotification(donorUid, newStatus, campId, requestId);
    }

    return { success: true };
  } catch (error: any) {
    await logAudit(requestId, actorUid, actorName, 'UPDATE_STATUS', 'Failed', error.message || 'Status transition denied.');
    throw new functions.https.HttpsError('internal', 'Failed to update request status.');
  }
}

async function handleMatchDonor(campId: string, requestId: string, donorUid: string, actorUid: string, actorName: string) {
  const db = admin.database();
  
  // 0. Eligibility check
  const historyRef = db.ref(`donor_history/${donorUid}`);
  const historySnapshot = await historyRef.orderByChild('donationDate').limitToLast(1).once('value');
  
  if (historySnapshot.exists()) {
    let latestDate = 0;
    historySnapshot.forEach((child) => {
      const record = child.val();
      if (record.donationDate > latestDate) {
        latestDate = record.donationDate;
      }
    });
    const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
    if (Date.now() - latestDate < ninetyDaysInMs) {
      const nextEligibleDate = new Date(latestDate + ninetyDaysInMs).toLocaleDateString();
      throw new functions.https.HttpsError('failed-precondition', `Donor not eligible. Wait 90 days. Next eligible date: ${nextEligibleDate}`);
    }
  }

  const requestSnap = await db.ref(`transactions/donation_request/${campId}/${requestId}`).once('value');
  if (!requestSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Donation request not found.');
  }
  const requestDetails = requestSnap.val();
  const recipientBloodGroupId = requestDetails.blood_groupId;
  const unitsSecured = requestDetails.unitsSecured || 0;
  const unitsNeeded = requestDetails.unitsNeeded || 1;
  
  if (unitsSecured >= unitsNeeded) {
    throw new functions.https.HttpsError('failed-precondition', 'Donation request is already fully fulfilled.');
  }

  // 0.5 Donor profile validation & compatibility check
  const donorProfileSnap = await db.ref(`users/${donorUid}`).once('value');
  if (!donorProfileSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Donor profile not found.');
  }
  const donorData = donorProfileSnap.val();
  if (donorData.role !== 'Donor') {
    throw new functions.https.HttpsError('failed-precondition', 'User is not a Donor.');
  }
  
  if (recipientBloodGroupId) {
    const compatibleGroups = getCompatibleDonorGroups(recipientBloodGroupId);
    if (!donorData.bloodGroup || !compatibleGroups.includes(donorData.bloodGroup)) {
      await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', 'Donor physically incompatible with recipient.');
      throw new functions.https.HttpsError('failed-precondition', 'Donor blood group is physically incompatible with recipient.');
    }
  }

  const lockRef = db.ref(`active_donor_matches/${donorUid}`);
  
  // 1. Try to acquire lock using transaction
  let lockAcquired = false;
  try {
    const transactionResult = await lockRef.transaction((currentData) => {
      if (currentData === null) {
        return {
          requestId,
          campId,
          matchedAt: { '.sv': 'timestamp' }
        };
      }
      return undefined; // abort
    });
    lockAcquired = transactionResult.committed;
  } catch (err) {
    console.error("Transaction error:", err);
    lockAcquired = false;
  }

  if (!lockAcquired) {
    // Log failure
    await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', 'Race condition lost: Donor matched to another request.');
    throw new functions.https.HttpsError('already-exists', 'Donor was just matched to another request.');
  }

  // 2. Update matches subcollection and request status
  

  try {
    const updates: any = {};
    updates[`matches/${requestId}/${donorUid}`] = {
      status: 'pending_response',
      matchedAt: { '.sv': 'timestamp' },
      respondedAt: null
    };
    updates[`transactions/donation_request/${campId}/${requestId}/status`] = 'Pending Response';
    updates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
    
    await db.ref().update(updates);
    
    await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Success', null, 'Verified', 'Matched');
    
    await safeSendEmailNotification(donorUid, 'Matched', campId, requestId);
    
    return { success: true };
  } catch (err: any) {
    // Cleanup lock
    console.error("Failed to update status, reverting lock", err);
    await lockRef.set(null);
    
    await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', err.message || 'Status update failed.');
    throw new functions.https.HttpsError('internal', 'Failed to update request status. Match aborted.');
  }
}

async function findNextEligibleDonor(campId: string, requestId: string, recipientBloodGroupId: string): Promise<string | null> {
  const db = admin.database();
  
  // 1. Get all matches for this request to know who to exclude
  const matchesSnap = await db.ref(`matches/${requestId}`).once('value');
  const excludedDonors = new Set<string>();
  if (matchesSnap.exists()) {
    matchesSnap.forEach(child => {
      excludedDonors.add(child.key as string);
    });
  }

  // 2. Get all users
  const usersSnap = await db.ref('users').once('value');
  const compatibleGroups = getCompatibleDonorGroups(recipientBloodGroupId);

  const eligibleDonors: string[] = [];
  
  const historySnap = await db.ref('donor_history').once('value');
  const ninetyDaysInMs = 90 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  usersSnap.forEach(userSnap => {
    const uid = userSnap.key as string;
    const data = userSnap.val();
    
    if (data.role !== 'Donor') return;
    if (excludedDonors.has(uid)) return;
    if (!data.bloodGroup || !compatibleGroups.includes(data.bloodGroup)) return;
    
    // Check history
    let isEligible = true;
    const userHistory = historySnap.child(uid);
    if (userHistory.exists()) {
       let latestDate = 0;
       userHistory.forEach(donationSnap => {
         const d = donationSnap.val().donationDate;
         if (d > latestDate) latestDate = d;
       });
       if (now - latestDate < ninetyDaysInMs) {
         isEligible = false;
       }
    }
    
    if (isEligible) {
      eligibleDonors.push(uid);
    }
  });

  // 3. Filter out those already active in active_donor_matches
  const activeSnap = await db.ref('active_donor_matches').once('value');
  if (activeSnap.exists()) {
     activeSnap.forEach(activeChild => {
        const index = eligibleDonors.indexOf(activeChild.key as string);
        if (index !== -1) {
          eligibleDonors.splice(index, 1);
        }
     });
  }

  if (eligibleDonors.length > 0) {
    return eligibleDonors[0];
  }

  return null;
}

async function handleRespondToMatch(campId: string, requestId: string, donorUid: string, response: 'accept' | 'decline', actorUid: string, actorName: string) {
  const db = admin.database();

  const matchRef = db.ref(`matches/${requestId}/${donorUid}`);
  const matchSnap = await matchRef.once('value');
  if (!matchSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Match not found.');
  }
  const matchData = matchSnap.val();
  if (matchData.status !== 'pending_response') {
    throw new functions.https.HttpsError('failed-precondition', 'Match is no longer pending response.');
  }

  const requestRef = db.ref(`transactions/donation_request/${campId}/${requestId}`);
  const requestSnap = await requestRef.once('value');
  if (!requestSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Donation request not found.');
  }
  const requestDetails = requestSnap.val();

  if (response === 'accept') {
    let updatedUnitsSecured = 0;
    try {
      const transactionResult = await requestRef.child('unitsSecured').transaction((currentUnits) => {
        const units = (currentUnits || 0) + 1;
        updatedUnitsSecured = units;
        return units;
      });
      if (!transactionResult.committed) {
         throw new functions.https.HttpsError('internal', 'Transaction aborted');
      }
    } catch(err) {
      throw new functions.https.HttpsError('internal', 'Failed to update unitsSecured');
    }

    await matchRef.update({
      status: 'accepted',
      respondedAt: { '.sv': 'timestamp' }
    });

    let newReqStatus = 'Partially Matched';
    if (updatedUnitsSecured >= requestDetails.unitsNeeded) {
      newReqStatus = 'Matched';
    }
    await requestRef.update({ status: newReqStatus });

    await logAudit(requestId, actorUid, actorName, 'RESPOND_TO_MATCH', 'Success', null, 'Pending Response', `Accepted (${newReqStatus})`);
    return { success: true };
  } else if (response === 'decline') {
    await matchRef.update({
      status: 'declined',
      respondedAt: { '.sv': 'timestamp' }
    });

    // Release lock
    await db.ref(`active_donor_matches/${donorUid}`).remove();
    await logAudit(requestId, actorUid, actorName, 'RESPOND_TO_MATCH', 'Success', null, 'Pending Response', 'Declined');

    const urgency = requestDetails.urgency || 'Routine';
    if (urgency === 'Critical' || urgency === 'Urgent') {
      const replacementDonor = await findNextEligibleDonor(campId, requestId, requestDetails.blood_groupId);
      if (replacementDonor) {
        await handleMatchDonor(campId, requestId, replacementDonor, 'SYSTEM', 'Auto-Match System');
        if (urgency === 'Critical') {
           await logAudit(requestId, 'SYSTEM', 'Auto-Match System', 'AUTO_MATCH', 'Success', null, undefined, `Auto-matched replacement donor ${replacementDonor} for Critical request after decline`);
        } else if (urgency === 'Urgent') {
           await requestRef.update({ needsAdminAttention: true });
        }
      } else {
        await requestRef.update({ needsAdminAttention: true });
        await logAudit(requestId, 'SYSTEM', 'Auto-Match System', 'AUTO_MATCH', 'Failed', 'No eligible replacement donor found', undefined, undefined);
      }
    }
    return { success: true };
  } else {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid response type');
  }
}

async function logAudit(
  requestId: string, 
  actorUid: string, 
  actorName: string, 
  action: string, 
  status: string, 
  failureReason?: string | null,
  beforeStatus?: string,
  afterStatus?: string
) {
  const auditRef = admin.database().ref(`audit_logs/donation_requests/${requestId}`).push();
  const logEntry: any = {
    timestamp: { '.sv': 'timestamp' },
    actorUid,
    actorName,
    action,
    status,
  };
  
  if (failureReason) logEntry.failureReason = failureReason;
  if (beforeStatus) logEntry.beforeStatus = beforeStatus;
  if (afterStatus) logEntry.afterStatus = afterStatus;
  
  await auditRef.set(logEntry);
}

// Phase 2: Admin-Provisioned User Creation
export const createUserByAdmin = functions.https.onCall({ secrets: [emailjsServiceId, emailjsTemplateId, emailjsPublicKey, emailjsPrivateKey] }, async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { email, name, role, campId, bloodGroup } = data;

  if (!email || !name || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required user parameters.');
  }

  // Get caller profile
  const callerRef = admin.database().ref(`users/${auth.uid}`);
  const callerSnapshot = await callerRef.get();
  
  if (!callerSnapshot.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }

  const callerProfile = callerSnapshot.val();

  // Validate caller permissions
  if (callerProfile.role === 'Manager') {
    if (role !== 'Donor' || campId !== callerProfile.campId) {
      throw new functions.https.HttpsError('permission-denied', 'Managers can only create Donors in their own camp.');
    }
  } else if (callerProfile.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Insufficient permissions to create users.');
  }

  try {
    // 1. Create the Firebase Auth user
    const userRecord = await admin.auth().createUser({
      email,
      displayName: name,
      // Setting a random password initially. Users will reset it via email link.
      password: Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10)
    });

    // 2. Write to RTDB
    const userPayload: any = {
      email,
      name,
      role,
      bloodGroup: bloodGroup || null,
      bloodGroupVerified: false,
      provisionedBy: 'admin',
      accountStatus: 'pending_activation',
      createdAt: { '.sv': 'timestamp' }
    };
    if (campId) {
      userPayload.campId = campId;
    }

    await admin.database().ref(`users/${userRecord.uid}`).set(userPayload);

    // 3. Generate password reset link
    const link = await admin.auth().generatePasswordResetLink(email);

    // Send the activation email
    await sendActivationEmail(userRecord.uid, email, name, link, 'admin');

    // Only log the activation link in local emulator environments to prevent leaking credentials in production logs
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      console.log(`[EMULATOR ONLY] Activation link for ${email}: ${link}`);
    }

    return { success: true, uid: userRecord.uid };
  } catch (error: any) {
    console.error('Error creating user:', error);
    if (error.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'An account with this email already exists.');
    }
    throw new functions.https.HttpsError('internal', 'Failed to create user.');
  }
});

// Phase 3: Self-Signup Email Verification
export const requestSelfSignupVerification = functions.https.onCall({ secrets: [emailjsServiceId, emailjsTemplateId, emailjsPublicKey, emailjsPrivateKey] }, async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = auth.uid;
  const email = auth.token.email;
  
  if (!email) {
    throw new functions.https.HttpsError('invalid-argument', 'Authenticated user does not have an email.');
  }

  // Get name from RTDB profile, fallback to email prefix if not found
  const profileSnapshot = await admin.database().ref(`users/${uid}`).get();
  let name = email.split('@')[0];
  if (profileSnapshot.exists()) {
    const profile = profileSnapshot.val();
    if (profile.name) name = profile.name;
  }

  try {
    const link = await admin.auth().generatePasswordResetLink(email);
    await sendActivationEmail(uid, email, name, link, 'self');
    
    if (process.env.FUNCTIONS_EMULATOR === 'true') {
      console.log(`[EMULATOR ONLY] Self-signup link for ${email}: ${link}`);
    }
    
    return { success: true };
  } catch (error) {
    console.error('Failed to generate verification link:', error);
    throw new functions.https.HttpsError('internal', 'Failed to process self-signup verification.');
  }
});
