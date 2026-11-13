import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import * as crypto from 'crypto';
import { defineSecret } from 'firebase-functions/params';
import { resolveCollectionDestination } from './domain/routing';
import { isBloodCompatible } from './domain/compatibility';

const databaseURL = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  ? `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}/?ns=cap23-blood-donation-default-rtdb`
  : (process.env.FIREBASE_DATABASE_URL || 'https://cap23-blood-donation-default-rtdb.asia-southeast1.firebasedatabase.app');

admin.initializeApp({
  databaseURL
});

// Utilities
export type BloodComponentType = 'WholeBlood' | 'Platelets' | 'Plasma';

// Transfusion Medicine Compatibility Matrix:
// 1. Fresh Frozen Plasma (FFP): Rh(D) is clinically irrelevant; ABO is the exact inverse of RBC.
// 2. Whole Blood / RBC / Platelets: Strict ABO and Rh matching.
export const getCompatibleDonorGroups = (
  recipientBloodGroupId: string,
  componentType: BloodComponentType = 'WholeBlood'
): string[] => {
  if (componentType === 'Plasma') {
    switch (recipientBloodGroupId) {
      case 'O_plus':
      case 'O_minus':
        return ['O_plus', 'O_minus', 'A_plus', 'A_minus', 'B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'A_plus':
      case 'A_minus':
        return ['A_plus', 'A_minus', 'AB_plus', 'AB_minus'];
      case 'B_plus':
      case 'B_minus':
        return ['B_plus', 'B_minus', 'AB_plus', 'AB_minus'];
      case 'AB_plus':
      case 'AB_minus':
        return ['AB_plus', 'AB_minus'];
      default:
        return [];
    }
  }

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

/**
 * Transfusion Cooldown & Safety Configuration
 * Sources:
 * 1. Drugs and Cosmetics Rules, 1945, Schedule F, Part XII-B (Apheresis statutory limits)
 * 2. National Standards for Blood Centres / DGHS Transfusion Medicine Technical Manual (MoHFW)
 * 3. NBTC Guidelines (90 days male / 120 days female) - See Decision Log ID-016
 */
export const TRANSFUSION_CONFIG = {
  // Standalone inter-donation intervals (in days)
  WHOLE_BLOOD_INTERVAL_DAYS: 90,        // Universal baseline floor (MoHFW / Drugs & Cosmetics Rules)
  WHOLE_BLOOD_FEMALE_INTERVAL_DAYS: 120, // NBTC guideline for female donors (deferred in schema per ID-016)
  PLATELET_INTERVAL_DAYS: 7,             // 7-day safe camp interval (statutory min is 48 hours)
  PLASMA_INTERVAL_DAYS: 28,             // Standard plasma replenishment interval

  // Cross-component intervals (in days)
  WB_TO_APHERESIS_DAYS: 28,             // Whole Blood -> Apheresis (DGHS Technical Manual)
  APHERESIS_TO_WB_DAYS: 28,             // Apheresis -> Whole Blood (DGHS Technical Manual)

  // Apheresis statutory safety caps (Drugs & Cosmetics Rules, Schedule F, Part XII-B)
  MAX_PLATELET_DONATIONS_7_DAYS: 2,      // Max 2 times in 7 days
  MAX_PLATELET_DONATIONS_365_DAYS: 24    // Max 24 times in 365 days
};

/**
 * Match Response Timeout SLA (Decision Log ID-015)
 * If a matched donor does not respond within this window, the match auto-times-out,
 * releases the donor reservation lock, and automatically initiates replacement search.
 */
export const MATCH_TIMEOUT_CONFIG = {
  Critical: 15 * 60 * 1000,    // 15 minutes for Critical requisitions
  Urgent: 2 * 60 * 60 * 1000,   // 2 hours for Urgent requisitions
  Routine: 24 * 60 * 60 * 1000  // 24 hours for Routine requisitions
};

export interface DonorEligibilityResult {
  isEligible: boolean;
  reason?: string;
  nextEligibleDate?: string;
}

export function evaluateDonorEligibility(
  historyRecords: any[],
  requestedComponent: BloodComponentType = 'WholeBlood',
  now: number = Date.now()
): DonorEligibilityResult {
  let latestWholeBloodDate = 0;
  let latestPlateletsDate = 0;
  let latestPlasmaDate = 0;
  let plateletsIn7Days = 0;
  let plateletsIn365Days = 0;

  const msInDay = 24 * 60 * 60 * 1000;
  const sevenDaysMs = TRANSFUSION_CONFIG.PLATELET_INTERVAL_DAYS * msInDay;
  const twentyEightDaysMs = TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS * msInDay;
  const ninetyDaysMs = TRANSFUSION_CONFIG.WHOLE_BLOOD_INTERVAL_DAYS * msInDay;
  const threeSixtyFiveDaysMs = 365 * msInDay;

  for (const record of historyRecords) {
    if (!record || !record.donationDate) continue;
    const dDate = Number(record.donationDate);
    const comp: BloodComponentType = record.componentType || 'WholeBlood';

    if (comp === 'WholeBlood') {
      if (dDate > latestWholeBloodDate) latestWholeBloodDate = dDate;
    } else if (comp === 'Platelets') {
      if (dDate > latestPlateletsDate) latestPlateletsDate = dDate;
      if (now - dDate < 7 * msInDay) plateletsIn7Days++;
      if (now - dDate < threeSixtyFiveDaysMs) plateletsIn365Days++;
    } else if (comp === 'Plasma') {
      if (dDate > latestPlasmaDate) latestPlasmaDate = dDate;
    }
  }

  if (requestedComponent === 'WholeBlood') {
    if (latestWholeBloodDate > 0 && now - latestWholeBloodDate < ninetyDaysMs) {
      const nextDate = new Date(latestWholeBloodDate + ninetyDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 90 days after whole blood donation. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlateletsDate > 0 && now - latestPlateletsDate < twentyEightDaysMs) {
      const nextDate = new Date(latestPlateletsDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days after plateletpheresis before whole blood donation (DGHS Standard). Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlasmaDate > 0 && now - latestPlasmaDate < twentyEightDaysMs) {
      const nextDate = new Date(latestPlasmaDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days after plasmapheresis before whole blood donation. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
  } else if (requestedComponent === 'Platelets') {
    if (plateletsIn365Days >= TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_365_DAYS) {
      return { isEligible: false, reason: `Donor reached the statutory annual limit of 24 platelet donations in 365 days (Drugs & Cosmetics Rules, Schedule F, Part XII-B).` };
    }
    if (plateletsIn7Days >= TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_7_DAYS) {
      return { isEligible: false, reason: `Donor reached the statutory weekly limit of 2 platelet donations in 7 days (Drugs & Cosmetics Rules, Schedule F, Part XII-B).` };
    }
    if (latestWholeBloodDate > 0 && now - latestWholeBloodDate < twentyEightDaysMs) {
      const nextDate = new Date(latestWholeBloodDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days after whole blood donation before plateletpheresis (DGHS Standard). Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlateletsDate > 0 && now - latestPlateletsDate < sevenDaysMs) {
      const nextDate = new Date(latestPlateletsDate + sevenDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 7 days between platelet donations. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlasmaDate > 0 && now - latestPlasmaDate < twentyEightDaysMs) {
      const nextDate = new Date(latestPlasmaDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days after plasmapheresis before plateletpheresis. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
  } else if (requestedComponent === 'Plasma') {
    if (latestWholeBloodDate > 0 && now - latestWholeBloodDate < twentyEightDaysMs) {
      const nextDate = new Date(latestWholeBloodDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days after whole blood donation before plasmapheresis. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlasmaDate > 0 && now - latestPlasmaDate < twentyEightDaysMs) {
      const nextDate = new Date(latestPlasmaDate + twentyEightDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 28 days between plasma donations. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
    if (latestPlateletsDate > 0 && now - latestPlateletsDate < sevenDaysMs) {
      const nextDate = new Date(latestPlateletsDate + sevenDaysMs).toLocaleDateString();
      return { isEligible: false, reason: `Donor must wait 7 days after plateletpheresis before plasmapheresis. Next eligible date: ${nextDate}`, nextEligibleDate: nextDate };
    }
  }

  return { isEligible: true };
}

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

  // Action-specific role and permission verification
  if (action === 'MATCH_DONOR') {
    if (callerProfile.role !== 'Admin' && callerProfile.campId !== campId) {
      throw new functions.https.HttpsError('permission-denied', 'Only Camp Managers or Admins can match donors.');
    }
    if (!donorUid) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing donorUid for MATCH_DONOR action.');
    }
    return await handleMatchDonor(campId, requestId, donorUid, auth.uid, callerProfile.name || 'Unknown');
  } else if (action === 'RESPOND_TO_MATCH') {
    const { response } = data;
    if (!response || (response !== 'accept' && response !== 'decline')) {
      throw new functions.https.HttpsError('invalid-argument', 'Valid response (accept or decline) is required.');
    }

    // Strict Donor-Exclusive Consent Boundary (Decision ID-015):
    // Only the authenticated matched donor can accept or decline. Managers/Admins cannot proxy or override consent.
    if (callerProfile.role !== 'Donor') {
      throw new functions.https.HttpsError('permission-denied', 'Only matched donors can respond to match requests.');
    }

    if (donorUid && donorUid !== auth.uid) {
      throw new functions.https.HttpsError('permission-denied', 'Donors can only respond to their own matches.');
    }

    return await handleRespondToMatch(campId, requestId, auth.uid, response, auth.uid, callerProfile.name || 'Unknown');
  } else if (action === 'UPDATE_STATUS') {
    if (callerProfile.role !== 'Admin' && callerProfile.campId !== campId && callerProfile.role !== 'Storage') {
      throw new functions.https.HttpsError('permission-denied', 'Only Camp Managers, Storage Officers, or Admins can update status.');
    }
    const { currentStatus, newStatus, donorUid, volume, bloodGroup } = data;
    if (!currentStatus || !newStatus) {
      throw new functions.https.HttpsError('invalid-argument', 'Missing status parameters.');
    }
    return await handleUpdateStatus(campId, requestId, currentStatus, newStatus, auth.uid, callerProfile.name || 'Unknown', donorUid, volume, bloodGroup, callerProfile.role);
  }

  throw new functions.https.HttpsError('invalid-argument', `Unknown action: ${action}`);
});

async function handleUpdateStatus(campId: string, requestId: string, currentStatus: string, newStatus: string, actorUid: string, actorName: string, donorUid?: string, volume?: number, bloodGroup?: string, actorRole?: string) {
  const db = admin.database();
  try {
    const rootUpdates: any = {};
    const reqSnap = await db.ref(`transactions/donation_request/${campId}/${requestId}`).once('value');
    const reqData = reqSnap.val() || {};
    const recipientHospitalId = reqData.recipientHospitalId;

    if (newStatus === 'Donated') {
      const unitsNeeded = reqData.unitsNeeded || 1;
      const currentUnitsCollected = reqData.unitsCollected || 0;
      const collectedVolume = volume || 1;
      const newUnitsCollected = currentUnitsCollected + collectedVolume;
      
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/unitsCollected`] = newUnitsCollected;
      
      if (donorUid) {
        rootUpdates[`matches/${requestId}/${donorUid}/status`] = 'donated';
        rootUpdates[`matches/${requestId}/${donorUid}/donatedAt`] = { '.sv': 'timestamp' };
        rootUpdates[`matches/${requestId}/${donorUid}/volume`] = collectedVolume;
        rootUpdates[`active_donor_matches/${donorUid}`] = null;

        const compType: BloodComponentType = reqData.componentType || 'WholeBlood';

        rootUpdates[`donor_history/${donorUid}/${requestId}`] = {
          requestId,
          donationDate: { '.sv': 'timestamp' },
          volume: collectedVolume,
          componentType: compType,
          campId,
          verifiedBy: actorUid
        };
        rootUpdates[`donor_eligibility/${donorUid}/lastDonationDate`] = { '.sv': 'timestamp' };

        if (compType === 'WholeBlood') {
          rootUpdates[`donor_eligibility/${donorUid}/lastWholeBloodDate`] = { '.sv': 'timestamp' };
        } else if (compType === 'Platelets') {
          rootUpdates[`donor_eligibility/${donorUid}/lastPlateletsDate`] = { '.sv': 'timestamp' };
        } else if (compType === 'Plasma') {
          rootUpdates[`donor_eligibility/${donorUid}/lastPlasmaDate`] = { '.sv': 'timestamp' };
        }

        // Stamping verified blood group only if confirmed by licensed lab or registered manager
        if (bloodGroup && (actorRole === 'Manager' || actorRole === 'Admin')) {
          rootUpdates[`users/${donorUid}/bloodGroup`] = bloodGroup;
          rootUpdates[`users/${donorUid}/bloodGroupVerified`] = true;
          rootUpdates[`users/${donorUid}/bloodGroupVerifiedBy`] = actorUid;
          rootUpdates[`users/${donorUid}/bloodGroupVerifiedAt`] = { '.sv': 'timestamp' };
        }
      }

      // Determine final status based on fulfillment
      let finalStatus = 'Donated';
      if (newUnitsCollected < unitsNeeded) {
        finalStatus = 'Partially Matched';
      } else {
        // Full fulfillment: release any other stale locks
        const matchesSnap = await db.ref(`matches/${requestId}`).once('value');
        if (matchesSnap.exists()) {
          matchesSnap.forEach(child => {
            const matchDonorUid = child.key as string;
            if (matchDonorUid !== donorUid && child.val().status !== 'donated') {
              rootUpdates[`active_donor_matches/${matchDonorUid}`] = null;
            }
          });
        }
      }

      rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = finalStatus;
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

      if (recipientHospitalId) {
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/status`] = finalStatus;
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/unitsCollected`] = newUnitsCollected;
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
      }
    } else if (newStatus === 'Closed' || newStatus === 'Unfulfilled') {
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newStatus;
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

      // Release active locks strictly belonging to this request (Flaw 6 resolution)
      const matchesSnap = await db.ref(`matches/${requestId}`).once('value');
      if (matchesSnap.exists()) {
        const matchesVal = matchesSnap.val() || {};
        for (const matchDonorUid of Object.keys(matchesVal)) {
          const donorLockSnap = await db.ref(`active_donor_matches/${matchDonorUid}`).get();
          if (donorLockSnap.exists() && donorLockSnap.val().requestId === requestId) {
            rootUpdates[`active_donor_matches/${matchDonorUid}`] = null;
          }
        }
      }

      if (recipientHospitalId) {
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/status`] = newStatus;
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
      }
    } else {
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newStatus;
      rootUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

      if (recipientHospitalId) {
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/status`] = newStatus;
        rootUpdates[`hospital_requests/${recipientHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
      }
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
  
  const requestSnap = await db.ref(`transactions/donation_request/${campId}/${requestId}`).once('value');
  if (!requestSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Donation request not found.');
  }
  const requestDetails = requestSnap.val();
  const recipientBloodGroupId = requestDetails.blood_groupId;
  const requestedComponent: BloodComponentType = requestDetails.componentType || 'WholeBlood';
  const unitsNeeded = requestDetails.unitsNeeded || 1;
  const unitsCollected = requestDetails.unitsCollected || 0;
  
  // Calculate active matches count (donors who are pending_response, accepted, or donated)
  let activeMatchesCount = 0;
  const matchesSnap = await db.ref(`matches/${requestId}`).once('value');
  if (matchesSnap.exists()) {
    matchesSnap.forEach(child => {
      const st = child.val().status;
      if (st === 'pending_response' || st === 'accepted' || st === 'donated') {
        activeMatchesCount += (child.val().volume || 1);
      }
    });
  }

  if (activeMatchesCount >= unitsNeeded || unitsCollected >= unitsNeeded) {
    throw new functions.https.HttpsError('failed-precondition', 'Donation request is already fully matched or collected.');
  }

  // 0. Eligibility check against NACO/NBTC & DGHS component cooldown matrix
  const historyRef = db.ref(`donor_history/${donorUid}`);
  const historySnapshot = await historyRef.once('value');
  
  if (historySnapshot.exists()) {
    const historyRecords: any[] = [];
    historySnapshot.forEach((child) => {
      historyRecords.push(child.val());
    });
    const eligibility = evaluateDonorEligibility(historyRecords, requestedComponent);
    if (!eligibility.isEligible) {
      await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', eligibility.reason || 'Donor ineligible.');
      throw new functions.https.HttpsError('failed-precondition', eligibility.reason || 'Donor is not currently eligible.');
    }
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

  if (donorData.medical_referral === 'DEFERRED' || donorData.isDeferred === true) {
    await logAudit(requestId, actorUid, actorName, 'MATCH_DONOR', 'Failed', 'Donor deferred due to serological / medical safety findings.');
    throw new functions.https.HttpsError('failed-precondition', 'Donor is medically deferred from blood donation.');
  }
  
  if (recipientBloodGroupId) {
    const compatibleGroups = getCompatibleDonorGroups(recipientBloodGroupId, requestedComponent);
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
    const urgency = requestDetails.urgency || 'Routine';
    const timeoutDurationMs = MATCH_TIMEOUT_CONFIG[urgency as keyof typeof MATCH_TIMEOUT_CONFIG] || MATCH_TIMEOUT_CONFIG.Routine;
    const expiresAt = Date.now() + timeoutDurationMs;

    const updates: any = {};
    updates[`matches/${requestId}/${donorUid}`] = {
      status: 'pending_response',
      matchedAt: { '.sv': 'timestamp' },
      expiresAt,
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

async function findNextEligibleDonor(campId: string, requestId: string, recipientBloodGroupId: string, componentType?: BloodComponentType): Promise<string | null> {
  const db = admin.database();
  const requestedComponent: BloodComponentType = componentType || 'WholeBlood';
  
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
  const compatibleGroups = getCompatibleDonorGroups(recipientBloodGroupId, requestedComponent);

  const eligibleDonors: string[] = [];
  
  const historySnap = await db.ref('donor_history').once('value');
  const now = Date.now();

  usersSnap.forEach(userSnap => {
    const uid = userSnap.key as string;
    const data = userSnap.val();
    
    if (data.role !== 'Donor') return;
    if (excludedDonors.has(uid)) return;
    if (data.medical_referral === 'DEFERRED' || data.isDeferred === true) return; // Statutory infection safety guard
    if (!data.bloodGroup || !compatibleGroups.includes(data.bloodGroup)) return;
    
    // Check history with evaluateDonorEligibility
    let isEligible = true;
    const userHistory = historySnap.child(uid);
    if (userHistory.exists()) {
       const userRecords: any[] = [];
       userHistory.forEach(donationSnap => {
         userRecords.push(donationSnap.val());
       });
       const eligibility = evaluateDonorEligibility(userRecords, requestedComponent, now);
       if (!eligibility.isEligible) {
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

async function handleRespondToMatch(
  campId: string, 
  requestId: string, 
  donorUid: string, 
  response: 'accept' | 'decline', 
  actorUid: string, 
  actorName: string
) {
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
  if (matchData.expiresAt && matchData.expiresAt < Date.now()) {
    throw new functions.https.HttpsError('deadline-exceeded', 'Match request has expired due to timeout. Please await rematching.');
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

    let newReqStatus = 'Partially Matched';
    if (updatedUnitsSecured >= requestDetails.unitsNeeded) {
      newReqStatus = 'Matched';
    }

    const matchAcceptUpdates: Record<string, any> = {};
    matchAcceptUpdates[`matches/${requestId}/${donorUid}/status`] = 'accepted';
    matchAcceptUpdates[`matches/${requestId}/${donorUid}/respondedAt`] = { '.sv': 'timestamp' };
    matchAcceptUpdates[`transactions/donation_request/${campId}/${requestId}/status`] = newReqStatus;
    matchAcceptUpdates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

    if (requestDetails.recipientHospitalId) {
      matchAcceptUpdates[`hospital_requests/${requestDetails.recipientHospitalId}/${requestId}/status`] = newReqStatus;
      matchAcceptUpdates[`hospital_requests/${requestDetails.recipientHospitalId}/${requestId}/unitsSecured`] = updatedUnitsSecured;
      matchAcceptUpdates[`hospital_requests/${requestDetails.recipientHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
    }

    await db.ref().update(matchAcceptUpdates);

    const auditDetails = `Donor Self-Response: Accepted (${newReqStatus})`;

    await logAudit(requestId, actorUid, actorName, 'RESPOND_TO_MATCH', 'Success', null, 'Pending Response', newReqStatus, auditDetails);
    return { success: true };
  } else if (response === 'decline') {
    const matchDeclineUpdates: Record<string, any> = {};
    matchDeclineUpdates[`matches/${requestId}/${donorUid}/status`] = 'declined';
    matchDeclineUpdates[`matches/${requestId}/${donorUid}/respondedAt`] = { '.sv': 'timestamp' };
    matchDeclineUpdates[`active_donor_matches/${donorUid}`] = null;
    await db.ref().update(matchDeclineUpdates);

    const auditDetails = 'Donor Self-Response: Declined';

    await logAudit(requestId, actorUid, actorName, 'RESPOND_TO_MATCH', 'Success', null, 'Pending Response', 'Declined', auditDetails);

    const urgency = requestDetails.urgency || 'Routine';
    if (urgency === 'Critical' || urgency === 'Urgent') {
      const replacementDonor = await findNextEligibleDonor(
        campId, 
        requestId, 
        requestDetails.blood_groupId, 
        requestDetails.componentType || 'WholeBlood'
      );
      if (replacementDonor) {
        await handleMatchDonor(campId, requestId, replacementDonor, 'SYSTEM', 'Auto-Match System');
        if (urgency === 'Critical') {
           await logAudit(requestId, 'SYSTEM', 'Auto-Match System', 'AUTO_MATCH', 'Success', null, undefined, undefined, `Auto-matched replacement donor ${replacementDonor} for Critical request after decline`);
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
  afterStatus?: string,
  details?: string
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
  if (details) {
    logEntry.details = details;
  } else if (afterStatus && afterStatus.includes(':')) {
    logEntry.details = afterStatus;
  }
  
  await auditRef.set(logEntry);
}

// Phase 2: Admin-Provisioned User Creation
export const createUserByAdmin = functions.https.onCall({ secrets: [emailjsServiceId, emailjsTemplateId, emailjsPublicKey, emailjsPrivateKey] }, async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { email, name, role, campId, bloodGroup, hospitalId } = data;

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

  if (role === 'Hospital') {
    if (callerProfile.role !== 'Admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only Admins can provision Hospital users.');
    }
    if (!hospitalId) {
      throw new functions.https.HttpsError('invalid-argument', 'hospitalId is required when creating a Hospital user.');
    }
    const hospSnap = await admin.database().ref(`masters/hospital/${hospitalId}`).get();
    if (!hospSnap.exists()) {
      throw new functions.https.HttpsError('not-found', `Hospital '${hospitalId}' does not exist in master records.`);
    }
  }

  if (role === 'Storage') {
    if (callerProfile.role !== 'Admin') {
      throw new functions.https.HttpsError('permission-denied', 'Only Admins can provision Storage users.');
    }
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
    if (role === 'Hospital' && hospitalId) {
      userPayload.hospitalId = hospitalId;
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

// Phase 6: Hospital Requisition System (ID-014)
export const submitHospitalRequisition = functions.https.onCall(async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const db = admin.database();

  // 1. Verify caller profile and role
  const userSnap = await db.ref(`users/${auth.uid}`).get();
  if (!userSnap.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }
  const callerProfile = userSnap.val();
  if (callerProfile.role !== 'Hospital' && callerProfile.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Hospital staff or Admins can submit blood requisitions.');
  }

  const hospitalId = callerProfile.role === 'Hospital' ? callerProfile.hospitalId : (data.hospitalId || callerProfile.hospitalId);
  if (!hospitalId) {
    throw new functions.https.HttpsError('invalid-argument', 'No hospitalId linked to this account.');
  }

  const {
    recipientName,
    blood_groupId,
    componentType,
    unitsNeeded,
    urgency,
    campId,
    notes,
    patientId
  } = data;

  if (!recipientName || !blood_groupId || !campId || !unitsNeeded) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required requisition fields (recipientName, blood_groupId, campId, unitsNeeded).');
  }

  const units = parseInt(unitsNeeded, 10);
  if (isNaN(units) || units < 1 || units > 20) {
    throw new functions.https.HttpsError('invalid-argument', 'unitsNeeded must be a valid integer between 1 and 20.');
  }

  const validComponents: BloodComponentType[] = ['WholeBlood', 'Platelets', 'Plasma'];
  const comp: BloodComponentType = validComponents.includes(componentType) ? componentType : 'WholeBlood';

  const validUrgencies = ['Routine', 'Urgent', 'Critical'];
  const reqUrgency = validUrgencies.includes(urgency) ? urgency : 'Routine';

  // Validate target camp exists
  const campSnap = await db.ref(`masters/camp/${campId}`).get();
  if (!campSnap.exists()) {
    throw new functions.https.HttpsError('not-found', `Target Camp '${campId}' does not exist.`);
  }

  // Validate blood group exists
  const bgSnap = await db.ref(`masters/blood_group/${blood_groupId}`).get();
  if (!bgSnap.exists()) {
    throw new functions.https.HttpsError('not-found', `Blood Group '${blood_groupId}' does not exist.`);
  }

  // Generate push ID under camp
  const newReqRef = db.ref(`transactions/donation_request/${campId}`).push();
  const requestId = newReqRef.key as string;

  const requestPayload: any = {
    requestId,
    campId,
    recipientName,
    recipientHospitalId: hospitalId,
    blood_groupId,
    componentType: comp,
    unitsNeeded: units,
    unitsSecured: 0,
    urgency: reqUrgency,
    status: 'Registered',
    notes: notes || '',
    patientId: patientId || '',
    createdBy: auth.uid,
    createdByName: callerProfile.name || 'Hospital Staff',
    createdAt: { '.sv': 'timestamp' },
    updatedAt: { '.sv': 'timestamp' }
  };

  const hospitalRequestPayload: any = {
    requestId,
    campId,
    recipientName,
    recipientHospitalId: hospitalId,
    blood_groupId,
    componentType: comp,
    unitsNeeded: units,
    unitsSecured: 0,
    urgency: reqUrgency,
    status: 'Registered',
    notes: notes || '',
    patientId: patientId || '',
    createdAt: { '.sv': 'timestamp' },
    updatedAt: { '.sv': 'timestamp' }
  };

  const updates: Record<string, any> = {};
  updates[`transactions/donation_request/${campId}/${requestId}`] = requestPayload;
  updates[`hospital_requests/${hospitalId}/${requestId}`] = hospitalRequestPayload;

  await db.ref().update(updates);

  await logAudit(
    requestId,
    auth.uid,
    callerProfile.name || 'Hospital Staff',
    'CREATE_REQUEST',
    'Success',
    null,
    undefined,
    `Hospital requisition created for ${recipientName} (${units} units ${comp} ${blood_groupId})`
  );

  return { success: true, requestId, campId };
});

export const cancelHospitalRequisition = functions.https.onCall(async (request) => {
  const data = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const { campId, requestId, reason } = data;
  if (!campId || !requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'campId and requestId are required.');
  }

  const db = admin.database();

  // Verify caller profile
  const userSnap = await db.ref(`users/${auth.uid}`).get();
  if (!userSnap.exists()) {
    throw new functions.https.HttpsError('permission-denied', 'User profile not found.');
  }
  const callerProfile = userSnap.val();

  // Fetch the request
  const reqRef = db.ref(`transactions/donation_request/${campId}/${requestId}`);
  const reqSnap = await reqRef.get();
  if (!reqSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Donation request not found.');
  }

  const reqData = reqSnap.val();

  // Check hospital ownership unless Admin
  if (callerProfile.role !== 'Admin') {
    if (callerProfile.role !== 'Hospital' || callerProfile.hospitalId !== reqData.recipientHospitalId) {
      throw new functions.https.HttpsError('permission-denied', 'You do not have permission to cancel this requisition.');
    }
  }

  // Safety check: ONLY allow cancellation if in 'Registered' state!
  if (reqData.status !== 'Registered') {
    throw new functions.https.HttpsError(
      'failed-precondition',
      `Cannot cancel requisition in '${reqData.status}' state directly. Please contact the camp coordinator.`
    );
  }

  const cancelReason = reason || 'Cancelled by Hospital';

  const updates: Record<string, any> = {};
  updates[`transactions/donation_request/${campId}/${requestId}/status`] = 'Closed';
  updates[`transactions/donation_request/${campId}/${requestId}/cancellationReason`] = cancelReason;
  updates[`transactions/donation_request/${campId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

  if (reqData.recipientHospitalId) {
    updates[`hospital_requests/${reqData.recipientHospitalId}/${requestId}/status`] = 'Closed';
    updates[`hospital_requests/${reqData.recipientHospitalId}/${requestId}/cancellationReason`] = cancelReason;
    updates[`hospital_requests/${reqData.recipientHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
  }

  await db.ref().update(updates);

  await logAudit(
    requestId,
    auth.uid,
    callerProfile.name || 'Hospital Staff',
    'UPDATE_STATUS',
    'Success',
    null,
    'Registered',
    `Closed (Cancelled by Hospital: ${cancelReason})`
  );

  return { success: true };
});

/**
 * Phase 5/6: Automated Match Timeout Monitor & Rematch Engine (Decision ID-015)
 * Periodically or on-demand checks matches in 'pending_response'. If expiresAt has elapsed:
 * 1. Auto-declines match ('timed_out')
 * 2. Releases active_donor_matches lock
 * 3. Logs distinct audit trail
 * 4. Finds next eligible donor via cooldown engine and auto-matches replacement
 * 5. If no donor found, alerts coordinator by flagging needsAdminAttention
 */
export async function processMatchTimeoutsInternal(specificRequestId?: string, campIdHint?: string) {
  const db = admin.database();
  const now = Date.now();
  let timedOutCount = 0;
  let rematchedCount = 0;

  const expiredMatches: { requestId: string; donorUid: string }[] = [];

  if (specificRequestId) {
    const matchSnap = await db.ref(`matches/${specificRequestId}`).once('value');
    if (matchSnap.exists()) {
      matchSnap.forEach(child => {
        const donorUid = child.key as string;
        const data = child.val();
        if (data.status === 'pending_response') {
          const expiresAt = data.expiresAt || (data.matchedAt ? data.matchedAt + MATCH_TIMEOUT_CONFIG.Routine : 0);
          if (expiresAt > 0 && expiresAt <= now) {
            expiredMatches.push({ requestId: specificRequestId, donorUid });
          }
        }
      });
    }
  } else {
    const matchesSnap = await db.ref('matches').once('value');
    if (matchesSnap.exists()) {
      matchesSnap.forEach(reqSnap => {
        const reqId = reqSnap.key as string;
        reqSnap.forEach(child => {
          const donorUid = child.key as string;
          const data = child.val();
          if (data.status === 'pending_response') {
            const expiresAt = data.expiresAt || (data.matchedAt ? data.matchedAt + MATCH_TIMEOUT_CONFIG.Routine : 0);
            if (expiresAt > 0 && expiresAt <= now) {
              expiredMatches.push({ requestId: reqId, donorUid });
            }
          }
        });
      });
    }
  }

  for (const item of expiredMatches) {
    const { requestId, donorUid } = item;

    // Locate campId and request
    let campId = campIdHint;
    let requestDetails: any = null;

    if (campId) {
      const snap = await db.ref(`transactions/donation_request/${campId}/${requestId}`).once('value');
      if (snap.exists()) requestDetails = snap.val();
    }

    if (!requestDetails) {
      const campsSnap = await db.ref('transactions/donation_request').once('value');
      if (campsSnap.exists()) {
        campsSnap.forEach(cSnap => {
          if (cSnap.hasChild(requestId)) {
            campId = cSnap.key as string;
            requestDetails = cSnap.child(requestId).val();
            return true;
          }
          return false;
        });
      }
    }

    if (!campId || !requestDetails) {
      await db.ref(`matches/${requestId}/${donorUid}/status`).set('timed_out');
      await db.ref(`active_donor_matches/${donorUid}`).remove();
      timedOutCount++;
      continue;
    }

    // 1. Mark timed_out and release lock
    const timeoutUpdates: Record<string, any> = {};
    timeoutUpdates[`matches/${requestId}/${donorUid}/status`] = 'timed_out';
    timeoutUpdates[`matches/${requestId}/${donorUid}/timedOutAt`] = { '.sv': 'timestamp' };
    timeoutUpdates[`active_donor_matches/${donorUid}`] = null;
    await db.ref().update(timeoutUpdates);
    timedOutCount++;

    await logAudit(
      requestId,
      'SYSTEM',
      'Timeout Monitor',
      'MATCH_TIMEOUT',
      'Success',
      null,
      'Pending Response',
      'Timed Out',
      `Match for donor ${donorUid} timed out (SLA elapsed). Reservation lock released.`
    );

    // 2. Automated Rematch Engine
    const recipientBloodGroupId = requestDetails.blood_groupId;
    const requestedComponent: BloodComponentType = requestDetails.componentType || 'WholeBlood';

    const replacementDonor = await findNextEligibleDonor(campId, requestId, recipientBloodGroupId, requestedComponent);
    if (replacementDonor) {
      await handleMatchDonor(campId, requestId, replacementDonor, 'SYSTEM', 'Auto-Match System');
      await logAudit(
        requestId,
        'SYSTEM',
        'Auto-Match System',
        'AUTO_MATCH',
        'Success',
        null,
        undefined,
        undefined,
        `Auto-matched replacement donor ${replacementDonor} following donor ${donorUid} timeout`
      );
      rematchedCount++;
    } else {
      const flagUpdates: Record<string, any> = {};
      flagUpdates[`transactions/donation_request/${campId}/${requestId}/needsAdminAttention`] = true;
      if (requestDetails.recipientHospitalId) {
        flagUpdates[`hospital_requests/${requestDetails.recipientHospitalId}/${requestId}/needsAdminAttention`] = true;
      }
      await db.ref().update(flagUpdates);

      await logAudit(
        requestId,
        'SYSTEM',
        'Auto-Match System',
        'AUTO_MATCH',
        'Failed',
        'No eligible replacement donor available following timeout',
        undefined,
        undefined,
        'Coordinator alert: needsAdminAttention flagged'
      );
    }
  }

  return { timedOutCount, rematchedCount };
}

export const processMatchTimeouts = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  const allowedRoles = ['Admin', 'Manager', 'CampCoordinator'];
  if (!allowedRoles.includes(caller.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only Admins, Managers, or Camp Coordinators can invoke match timeout sweeps.');
  }

  const { requestId, campId } = request.data || {};
  return await processMatchTimeoutsInternal(requestId, campId);
});

/**
 * -------------------------------------------------------------
 * CENTRAL STORAGE & COLD CHAIN MANAGEMENT (Milestone 1 & 2)
 * -------------------------------------------------------------
 */

// 1. Intake Storage Unit (Enforces Quarantined and server-side enteredBy)
export const intakeStorageUnit = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const callerSnap = await admin.database().ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admins can intake units.');
  }

  const data = request.data || {};
  const {
    bagBarcode,
    bloodGroup,
    componentType,
    volumeMl,
    preservativeSolution,
    storageTemperatureCelsius,
    storageLocation,
    sourceCampId,
    sourceBatchId,
    donorUid
  } = data;

  if (!bagBarcode || !bloodGroup || !componentType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing required unit fields.');
  }

  const db = admin.database();

  // Guard against duplicate barcode intake (memory-safe and index-independent)
  const existingUnitsSnap = await db.ref('inventory/units').get();
  if (existingUnitsSnap.exists()) {
    let hasActive = false;
    existingUnitsSnap.forEach((child) => {
      const u = child.val();
      if (u && u.bagBarcode && u.bagBarcode.trim().toLowerCase() === bagBarcode.trim().toLowerCase()) {
        if (u.status === 'Quarantined' || u.status === 'Certified' || u.status === 'Stock_Reserved' || u.status === 'ISSUE_UNCONFIRMED') {
          hasActive = true;
        }
      }
    });
    if (hasActive) {
      throw new functions.https.HttpsError('already-exists', `A blood bag with barcode "${bagBarcode}" is already in active inventory or quarantine.`);
    }
  }

  const unitRef = db.ref('inventory/units').push();
  const unitId = unitRef.key!;

  // Default shelf life days per DGHS rules
  let shelfLifeDays = 35;
  if (componentType === 'Platelets') shelfLifeDays = 5;
  else if (componentType === 'Plasma') shelfLifeDays = 365;
  else if (preservativeSolution === 'SAGM') shelfLifeDays = 42;

  const now = Date.now();
  const expiryDate = new Date(now + shelfLifeDays * 24 * 60 * 60 * 1000).toISOString();

  const unitPayload = {
    unitId,
    bagBarcode,
    bloodGroup,
    componentType,
    volumeMl: volumeMl || 350,
    collectionDate: new Date(now).toISOString(),
    expiryDate,
    preservativeSolution: preservativeSolution || 'CPDA-1',
    storageTemperatureCelsius: storageTemperatureCelsius ?? 4,
    status: 'Quarantined',
    storageLocation: storageLocation || 'Quarantine-Bay',
    sourceCampId: sourceCampId || null,
    sourceBatchId: sourceBatchId || null,
    enteredBy: auth.uid,
    createdAt: now
  };

  const updates: Record<string, any> = {};
  updates[`inventory/units/${unitId}`] = unitPayload;

  // Split-Node PII Ledger (DEC-016)
  if (donorUid) {
    updates[`inventory_donor_ledger/${unitId}`] = {
      unitId,
      bagBarcode,
      donorUid,
      donationDate: new Date(now).toISOString(),
      confidentialReferenceCode: `REF-${Math.random().toString(36).slice(-8).toUpperCase()}`
    };
  }

  // Audit log
  updates[`audit_logs/units/${unitId}/${now}`] = {
    unitId,
    actorUid: auth.uid,
    actorRole: caller.role,
    action: 'UNIT_INTAKE_QUARANTINED',
    status: 'Success',
    timestamp: now,
    details: `Intake unit ${bagBarcode} (${bloodGroup} ${componentType}) into Quarantine`
  };

  await db.ref().update(updates);
  return { success: true, unitId, status: 'Quarantined', expiryDate };
});

// 2. Certify Storage Unit (Maker-Checker & Lab-Confirmed TTI/ABO Gate)
export const certifyStorageUnit = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const callerSnap = await admin.database().ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admins can certify units.');
  }

  const { unitId, labConfirmedBloodGroup, rhTyping, ttiLotNumbers, isReactive, reactiveReason } = request.data || {};
  if (!unitId || !labConfirmedBloodGroup || !rhTyping || !ttiLotNumbers) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing mandatory lab typing or TTI lot verification.');
  }

  const db = admin.database();
  const unitSnap = await db.ref(`inventory/units/${unitId}`).get();
  if (!unitSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Unit not found.');
  }

  const unit = unitSnap.val();
  if (unit.status !== 'Quarantined') {
    throw new functions.https.HttpsError('failed-precondition', `Unit is in '${unit.status}' status, cannot certify.`);
  }

  // Maker-Checker Rule (DEC-015): Certifier must differ from intake officer
  if (unit.enteredBy === auth.uid && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Maker-Checker Violation: Certifier cannot be the same officer who entered the intake.');
  }

  const now = Date.now();
  const updates: Record<string, any> = {};

  if (isReactive) {
    // TTI Reactive discard path
    updates[`inventory/units/${unitId}/status`] = 'Discarded';
    updates[`inventory/units/${unitId}/discardReason`] = reactiveReason || 'TTI_REACTIVE';
    updates[`inventory/units/${unitId}/discardedAt`] = now;
    updates[`inventory/units/${unitId}/discardedBy`] = auth.uid;

    // Check if donor ledger exists and flag confidential referral without disease details
    const ledgerSnap = await db.ref(`inventory_donor_ledger/${unitId}`).get();
    if (ledgerSnap.exists()) {
      const donorUid = ledgerSnap.val().donorUid;
      updates[`users/${donorUid}/medical_referral`] = {
        status: 'DEFERRED',
        reason: 'CONTACT_CENTRE',
        updatedAt: now
      };
    }

    updates[`audit_logs/units/${unitId}/${now}`] = {
      unitId,
      actorUid: auth.uid,
      action: 'UNIT_DISCARDED_TTI_REACTIVE',
      status: 'Discarded',
      timestamp: now,
      details: `Unit ${unit.bagBarcode} discarded due to reactive serology.`
    };

    await db.ref().update(updates);
    return { success: true, status: 'Discarded' };
  }

  // Non-reactive: mark Certified and index for FEFO
  updates[`inventory/units/${unitId}/status`] = 'Certified';
  updates[`inventory/units/${unitId}/bloodGroup`] = labConfirmedBloodGroup;
  updates[`inventory/units/${unitId}/rhTyping`] = rhTyping;
  updates[`inventory/units/${unitId}/certifiedBy`] = auth.uid;
  updates[`inventory/units/${unitId}/certifiedAt`] = now;
  updates[`inventory/units/${unitId}/ttiLotNumbers`] = ttiLotNumbers;

  // Move from Quarantine Dock into active Chiller Shelf
  if (!unit.storageLocation || unit.storageLocation.toLowerCase().includes('quarantine')) {
    updates[`inventory/units/${unitId}/storageLocation`] = 'Chiller-Shelf-C1';
  }
  if (unit.storageTemperatureCelsius === undefined) {
    updates[`inventory/units/${unitId}/storageTemperatureCelsius`] = 4;
  }
  if (!unit.preservativeSolution) {
    updates[`inventory/units/${unitId}/preservativeSolution`] = 'CPDA-1';
  }

  // FEFO Index: /inventory/fefo/{group}_{component}/{expiryTimestamp}_{unitId}
  const expiryEpoch = new Date(unit.expiryDate).getTime();
  updates[`inventory/fefo/${labConfirmedBloodGroup}_${unit.componentType}/${expiryEpoch}_${unitId}`] = true;

  updates[`audit_logs/units/${unitId}/${now}`] = {
    unitId,
    actorUid: auth.uid,
    action: 'UNIT_CERTIFIED_SAFE',
    status: 'Certified',
    timestamp: now,
    details: `Unit ${unit.bagBarcode} certified safe for transfusion (Maker-checker confirmed).`
  };

  await db.ref().update(updates);
  return { success: true, status: 'Certified' };
});

// 3. Reserve Stock Units with Atomic Concurrency & FEFO Saga (Mode A)
export const reserveStockUnits = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Hospital' && caller.role !== 'Storage' && caller.role !== 'Admin' && caller.role !== 'Manager') {
    throw new functions.https.HttpsError('permission-denied', 'Only Hospital, Storage, Manager, or Admin can reserve stock units.');
  }

  const { requestId, recipientBloodGroupId, componentType, unitsNeeded } = request.data || {};
  if (!requestId || !recipientBloodGroupId || !componentType) {
    throw new functions.https.HttpsError('invalid-argument', 'Missing requisition details.');
  }

  const needed = unitsNeeded || 1;

  // 1. Query certified units with FEFO order from composite index
  const fefoRef = db.ref(`inventory/fefo/${recipientBloodGroupId}_${componentType}`);
  const fefoSnap = await fefoRef.orderByKey().limitToFirst(needed * 4).get();

  const candidateUnitIds: string[] = [];
  if (fefoSnap.exists()) {
    fefoSnap.forEach((child) => {
      const parts = child.key!.split('_');
      const unitId = parts.slice(1).join('_');
      candidateUnitIds.push(unitId);
    });
  }

  const reservationId = `RES-${Date.now()}`;
  const now = Date.now();
  const reservedUnits: any[] = [];
  const deadlineAt = now + 10 * 60 * 1000; // 10 minute physical scan deadline

  // 2. Perform atomic per-unit reservation transactions to eliminate TOCTOU races
  for (const unitId of candidateUnitIds) {
    if (reservedUnits.length >= needed) break;

    const txResult = await db.ref(`inventory/units/${unitId}`).transaction((current) => {
      if (!current) return current;
      if (current.status !== 'Certified') {
        return; // Abort: already reserved or status changed
      }
      current.status = 'Stock_Reserved';
      current.reservationId = reservationId;
      current.reservedAt = now;
      current.reservedForRequest = requestId;
      current.reservedBy = auth.uid;
      current.deadlineAt = deadlineAt;
      current.version = (current.version || 1) + 1;
      return current;
    });

    if (txResult.committed && txResult.snapshot.exists()) {
      const u = txResult.snapshot.val();
      reservedUnits.push(u);

      // Atomically remove from active FEFO index
      const expiryEpoch = new Date(u.expiryDate).getTime();
      await db.ref(`inventory/fefo/${recipientBloodGroupId}_${componentType}/${expiryEpoch}_${unitId}`).remove();

      // Register in flat watchdog index for 10-minute scan timeout
      await db.ref(`watchdogs/scan_timeout/${unitId}`).set({
        unitId,
        reservationId,
        requestId,
        deadlineAt,
        version: u.version
      });

      // Audit log entry
      await db.ref(`audit_logs/units/${unitId}/${now}`).set({
        unitId,
        actorUid: auth.uid,
        action: 'UNIT_STOCK_RESERVED',
        status: 'Stock_Reserved',
        timestamp: now,
        details: `Unit ${u.bagBarcode} atomically reserved for request ${requestId} (Deadline: 10m).`
      });
    }
  }

  // Synchronize reservation status across Camp and Hospital queues
  if (reservedUnits.length > 0) {
    let targetCampId = request.data?.campId;
    let targetHospitalId: string | null = null;
    let currentUnitsNeeded = needed;
    let currentUnitsSecured = 0;

    if (!targetCampId) {
      const campsSnap = await db.ref('masters/camp').get();
      if (campsSnap.exists()) {
        for (const cId of Object.keys(campsSnap.val())) {
          const reqSnap = await db.ref(`transactions/donation_request/${cId}/${requestId}`).get();
          if (reqSnap.exists()) {
            targetCampId = cId;
            const reqVal = reqSnap.val();
            currentUnitsNeeded = reqVal.unitsNeeded || needed;
            currentUnitsSecured = reqVal.unitsSecured || 0;
            targetHospitalId = reqVal.recipientHospitalId || null;
            break;
          }
        }
      }
    } else {
      const reqSnap = await db.ref(`transactions/donation_request/${targetCampId}/${requestId}`).get();
      if (reqSnap.exists()) {
        const reqVal = reqSnap.val();
        currentUnitsNeeded = reqVal.unitsNeeded || needed;
        currentUnitsSecured = reqVal.unitsSecured || 0;
        targetHospitalId = reqVal.recipientHospitalId || null;
      }
    }

    if (targetCampId) {
      const newSecured = currentUnitsSecured + reservedUnits.length;
      const newStatus = newSecured >= currentUnitsNeeded ? 'Matched' : 'Partially Matched';
      const rootUpdates: Record<string, any> = {};
      rootUpdates[`transactions/donation_request/${targetCampId}/${requestId}/unitsSecured`] = newSecured;
      rootUpdates[`transactions/donation_request/${targetCampId}/${requestId}/status`] = newStatus;
      rootUpdates[`transactions/donation_request/${targetCampId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };

      if (targetHospitalId) {
        rootUpdates[`hospital_requests/${targetHospitalId}/${requestId}/unitsSecured`] = newSecured;
        rootUpdates[`hospital_requests/${targetHospitalId}/${requestId}/status`] = newStatus;
        rootUpdates[`hospital_requests/${targetHospitalId}/${requestId}/updatedAt`] = { '.sv': 'timestamp' };
      }
      await db.ref().update(rootUpdates);
    }
  }

  if (reservedUnits.length >= needed) {
    // Mode A: Satisfied fully from cold storage!
    return { success: true, reservedUnits, mode: 'Mode_A' };
  }

  // If partial or depleted, signal Mode B required
  return {
    success: false,
    reservedUnits,
    mode: 'Mode_B_Required',
    deficit: needed - reservedUnits.length,
    message: `Insufficient stock on shelf (${reservedUnits.length}/${needed} available). Mobilizing Camp Donors (Mode B).`
  };
});

// 4. Confirm Barcode Dispatch (Dual-state: Stock_Reserved or ISSUE_UNCONFIRMED)
export const confirmBarcodeDispatch = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admin can confirm physical barcode dispatch.');
  }

  const { unitId, bagBarcode } = request.data || {};
  if (!unitId || !bagBarcode) {
    throw new functions.https.HttpsError('invalid-argument', 'Unit ID and Barcode required.');
  }

  // Atomic state transaction on inventory/units/{unitId} to prevent race with reconcileUnconfirmedUnit (R2)
  const unitRef = db.ref(`inventory/units/${unitId}`);
  let unitData: any = null;
  let isLate = false;

  const txnResult = await unitRef.transaction((currentUnit) => {
    if (!currentUnit) return currentUnit;
    if (currentUnit.bagBarcode !== bagBarcode) return; // mismatch aborts
    if (currentUnit.status !== 'Stock_Reserved' && currentUnit.status !== 'ISSUE_UNCONFIRMED') {
      return; // invalid status aborts
    }

    isLate = currentUnit.status === 'ISSUE_UNCONFIRMED';
    const now = Date.now();
    return {
      ...currentUnit,
      status: 'Dispatched',
      dispatchedAt: now,
      dispatchedBy: auth.uid,
      deadlineAt: null,
      lateScan: isLate ? true : (currentUnit.lateScan || false)
    };
  });

  if (!txnResult.committed || !txnResult.snapshot.exists()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Cannot dispatch unit: Barcode mismatch, unit not found, or unit is not in Stock_Reserved / ISSUE_UNCONFIRMED status.'
    );
  }

  unitData = txnResult.snapshot.val();
  const now = unitData.dispatchedAt || Date.now();
  const postUpdates: Record<string, any> = {};

  // Clear watchdog queue
  postUpdates[`watchdogs/scan_timeout/${unitId}`] = null;

  // Resolve hospital securely from unit.reservedForRequest, ignoring untrusted client hospitalId (R6)
  let resolvedHospitalId: string | null = null;
  if (unitData.reservedForRequest) {
    const reqSnap = await db.ref(`blood_requests/${unitData.reservedForRequest}`).get();
    if (reqSnap.exists()) {
      resolvedHospitalId = reqSnap.val().hospitalId || null;
    }
  }

  if (resolvedHospitalId) {
    postUpdates[`hospital_issues/${resolvedHospitalId}/${unitId}`] = {
      unitId,
      bagBarcode: unitData.bagBarcode,
      bloodGroup: unitData.bloodGroup,
      componentType: unitData.componentType,
      expiryDate: unitData.expiryDate,
      dispatchedAt: now
    };
  }

  postUpdates[`audit_logs/units/${unitId}/${now}`] = {
    unitId,
    actorUid: auth.uid,
    action: isLate ? 'UNIT_DISPATCHED_LATE_SCAN' : 'UNIT_DISPATCHED',
    status: 'Dispatched',
    timestamp: now,
    details: `Physical barcode verified. Unit ${unitData.bagBarcode} dispatched${isLate ? ' (Late scan accepted)' : ''}.`
  };

  await db.ref().update(postUpdates);
  return { success: true, lateScan: isLate };
});

// 5. Server-Validated 30-Minute Return Callable (processUnitReturn)
export const processUnitReturn = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admin can process returns.');
  }

  const { unitId, coldChainIntact, returnTempCelsius } = request.data || {};
  if (!unitId) throw new functions.https.HttpsError('invalid-argument', 'Unit ID required.');

  const unitSnap = await db.ref(`inventory/units/${unitId}`).get();
  if (!unitSnap.exists()) throw new functions.https.HttpsError('not-found', 'Unit not found.');

  const unit = unitSnap.val();
  if (unit.status !== 'Dispatched') {
    throw new functions.https.HttpsError('failed-precondition', `Unit is in status '${unit.status}', cannot return.`);
  }

  const now = Date.now();
  const elapsedMinutes = (now - (unit.dispatchedAt || now)) / (1000 * 60);
  const updates: Record<string, any> = {};

  // Component-specific rules
  let canReturnToCertified = false;
  let reason = '';

  if (unit.componentType === 'Plasma') {
    canReturnToCertified = false;
    reason = 'Thawed FFP / Cryo cannot be re-shelved.';
  } else if (unit.componentType === 'Platelets') {
    canReturnToCertified = elapsedMinutes <= 30 && coldChainIntact && returnTempCelsius >= 20 && returnTempCelsius <= 24;
    reason = canReturnToCertified ? 'Platelets returned in temperature range.' : 'Platelet return out of range or >30 mins.';
  } else {
    // RBC
    canReturnToCertified = elapsedMinutes <= 30 && coldChainIntact && returnTempCelsius <= 10;
    reason = canReturnToCertified ? 'RBC returned under 30 minutes with cold chain intact.' : `Return elapsed ${Math.round(elapsedMinutes)}m or temp ${returnTempCelsius}°C breached.`;
  }

  if (canReturnToCertified) {
    updates[`inventory/units/${unitId}/status`] = 'Certified';
    updates[`inventory/units/${unitId}/returnedAt`] = now;
    // Re-index into FEFO
    const expiryEpoch = new Date(unit.expiryDate).getTime();
    updates[`inventory/fefo/${unit.bloodGroup}_${unit.componentType}/${expiryEpoch}_${unitId}`] = true;
  } else {
    updates[`inventory/units/${unitId}/status`] = 'Discarded';
    updates[`inventory/units/${unitId}/discardReason`] = `RETURN_BREACH: ${reason}`;
    updates[`inventory/units/${unitId}/discardedAt`] = now;
  }

  updates[`audit_logs/units/${unitId}/${now}`] = {
    unitId,
    actorUid: auth.uid,
    action: canReturnToCertified ? 'UNIT_RETURNED_TO_STOCK' : 'UNIT_RETURN_DISCARDED',
    status: canReturnToCertified ? 'Certified' : 'Discarded',
    timestamp: now,
    details: reason
  };

  await db.ref().update(updates);
  return {
    success: true,
    status: canReturnToCertified ? 'Certified' : 'Discarded',
    elapsedMinutes,
    reason
  };
});

// 6. Ghost-Inventory Scan Timeout Watchdog Sweep (sweepScanTimeouts)
export const sweepScanTimeouts = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Storage Officers or Admin only.');
  }

  const { simulatedNow } = request.data || {};
  const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true' || !!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const now = (isEmulator && simulatedNow) ? Number(simulatedNow) : Date.now();
  const timeoutsSnap = await db.ref('watchdogs/scan_timeout')
    .orderByChild('deadlineAt')
    .endAt(now)
    .get();

  const timedOutUnits: string[] = [];
  if (timeoutsSnap.exists()) {
    const entries = timeoutsSnap.val();
    for (const unitId of Object.keys(entries)) {
      // Atomic transition from Stock_Reserved to ISSUE_UNCONFIRMED
      const txResult = await db.ref(`inventory/units/${unitId}`).transaction((current) => {
        if (!current) return current;
        if (current.status !== 'Stock_Reserved') return; // already dispatched or reconciled
        current.status = 'ISSUE_UNCONFIRMED';
        current.unconfirmedAt = now;
        current.version = (current.version || 1) + 1;
        return current;
      });

      if (txResult.committed && txResult.snapshot.exists()) {
        timedOutUnits.push(unitId);
        // Clear from watchdog queue
        await db.ref(`watchdogs/scan_timeout/${unitId}`).remove();

        // Audit log
        await db.ref(`audit_logs/units/${unitId}/${now}`).set({
          unitId,
          actorUid: 'SYSTEM_WATCHDOG',
          action: 'UNIT_SCAN_TIMEOUT_UNCONFIRMED',
          status: 'ISSUE_UNCONFIRMED',
          timestamp: now,
          details: `Unit ${unitId} exceeded 10m physical scan timeout. Held in quarantine (Mode B activated).`
        });
      }
    }
  }

  return { success: true, processedCount: timedOutUnits.length, timedOutUnits };
});

// 7. Reconcile Unconfirmed Unit (reconcileUnconfirmedUnit)
export const reconcileUnconfirmedUnit = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const callerSnap = await db.ref(`users/${auth.uid}`).get();
  const caller = callerSnap.val() || {};
  if (caller.role !== 'Storage' && caller.role !== 'Admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admin can reconcile unconfirmed units.');
  }

  const { unitId, physicalCheckPassed, reason } = request.data || {};
  if (!unitId) throw new functions.https.HttpsError('invalid-argument', 'Unit ID required.');

  // Atomic state transaction on inventory/units/{unitId} to prevent race with late barcode scan (R2)
  const unitRef = db.ref(`inventory/units/${unitId}`);
  let finalStatus: 'Certified' | 'Discarded' = 'Discarded';
  let unitData: any = null;

  const txnResult = await unitRef.transaction((currentUnit) => {
    if (!currentUnit) return currentUnit;
    if (currentUnit.status !== 'ISSUE_UNCONFIRMED') {
      return; // Already dispatched by late scan or otherwise modified - abort transaction
    }

    const now = Date.now();
    const expiryEpoch = new Date(currentUnit.expiryDate).getTime();
    const isExpired = expiryEpoch <= now;

    // Check expiry safety guard (R5): never re-certify an expired unit!
    if (physicalCheckPassed && !isExpired) {
      return {
        ...currentUnit,
        status: 'Certified',
        reconciledAt: now,
        deadlineAt: null,
        reservedForRequest: null
      };
    } else {
      const discardReason = isExpired && physicalCheckPassed
        ? 'RECONCILE_EXPIRED: Unit expired while in unconfirmed quarantine'
        : `RECONCILE_FAILED: ${reason || 'Physical inspection failed or missing'}`;
      return {
        ...currentUnit,
        status: 'Discarded',
        discardReason,
        reconciledAt: now,
        deadlineAt: null,
        reservedForRequest: null
      };
    }
  });

  if (!txnResult.committed || !txnResult.snapshot.exists()) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Reconciliation conflict: Unit is no longer in ISSUE_UNCONFIRMED status (may have been scanned concurrently).'
    );
  }

  unitData = txnResult.snapshot.val();
  finalStatus = unitData.status as ('Certified' | 'Discarded');
  const now = unitData.reconciledAt || Date.now();
  const postUpdates: Record<string, any> = {};

  if (finalStatus === 'Certified') {
    const expiryEpoch = new Date(unitData.expiryDate).getTime();
    postUpdates[`inventory/fefo/${unitData.bloodGroup}_${unitData.componentType}/${expiryEpoch}_${unitId}`] = true;
  }

  postUpdates[`audit_logs/units/${unitId}/${now}`] = {
    unitId,
    actorUid: auth.uid,
    action: finalStatus === 'Certified' ? 'UNIT_RECONCILED_CERTIFIED' : 'UNIT_RECONCILED_DISCARDED',
    status: finalStatus,
    timestamp: now,
    details: unitData.discardReason || reason || (finalStatus === 'Certified' ? 'Physical cold chain verified intact.' : 'Discarded upon physical inspection.')
  };

  await db.ref().update(postUpdates);
  return { success: true, status: finalStatus };
});

/**
 * -------------------------------------------------------------
 * ROUTINE & URGENT TIERED DISPATCH (Milestone 3)
 * -------------------------------------------------------------
 */

// 8. Urgent Atomic FCFS Slot Claiming (claimUrgentSlot)
export const claimUrgentSlot = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const donorUid = auth.uid;
  const { requestId } = request.data || {};
  if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'Request ID required.');

  // Fetch requisition details (check direct requisition or transactions/donation_request)
  let requisition: any = null;

  const directSnap = await db.ref(`blood_requests/${requestId}`).get();
  if (directSnap.exists()) {
    requisition = directSnap.val();
  } else {
    // Search in transactions/donation_request
    const txSnap = await db.ref('transactions/donation_request').get();
    if (txSnap.exists()) {
      txSnap.forEach(campChild => {
        if (campChild.hasChild(requestId)) {
          requisition = campChild.child(requestId).val();
        }
      });
    }
  }

  if (!requisition) throw new functions.https.HttpsError('not-found', 'Blood requisition not found.');

  // Guard against claims on closed or cancelled requisitions
  if (requisition.status === 'Closed' || requisition.status === 'Unfulfilled' || requisition.status === 'Cancelled') {
    throw new functions.https.HttpsError('failed-precondition', `Cannot claim slot: Requisition is in status '${requisition.status}'.`);
  }

  // Re-verify donor qualification: cooldown, active group, and verified identity
  const userSnap = await db.ref(`users/${donorUid}`).get();
  const donor = userSnap.val() || {};

  if (donor.role !== 'Donor' && donor.role !== 'User') {
    throw new functions.https.HttpsError('permission-denied', 'Only registered donors can claim emergency donation slots.');
  }

  if (donor.medical_referral === 'DEFERRED' || donor.isDeferred === true) {
    throw new functions.https.HttpsError('failed-precondition', 'Donor is medically deferred from blood donation.');
  }

  if (!donor.bloodGroup) throw new functions.https.HttpsError('failed-precondition', 'Donor blood group not registered.');

  const componentType: BloodComponentType = requisition.componentType || 'WholeBlood';
  const recipientGroup = requisition.patientBloodGroup || requisition.blood_groupId || requisition.bloodGroup;
  const isCompatible = recipientGroup ? isBloodCompatible(donor.bloodGroup, recipientGroup, componentType) : true;
  if (!isCompatible) {
    throw new functions.https.HttpsError('failed-precondition', 'Donor blood group is incompatible with recipient.');
  }

  // Double-lock Step 1: Secure an atomic, time-limited lease lock on active_donor_matches/{uid}
  const now = Date.now();
  const leaseDurationMs = 2 * 60 * 60 * 1000; // 2 hour dispatch lease
  const donorLockRef = db.ref(`active_donor_matches/${donorUid}`);

  let acquiredLock = false;
  const lockTx = await donorLockRef.transaction((current) => {
    // If donor has an active commitment to another requisition, abort
    if (current && current.requestId !== requestId) {
      // If lease expired, permit claim; otherwise, lock stands
      const isLeaseActive = current.leaseExpiresAt ? current.leaseExpiresAt > now : (current.status === 'CLAIMED' || current.status === 'MATCHED' || current.status === 'EN_ROUTE');
      if (isLeaseActive) {
        return; // Actively locked
      }
    }
    acquiredLock = true;
    return {
      requestId,
      status: 'CLAIMED',
      claimedAt: now,
      leaseExpiresAt: now + leaseDurationMs
    };
  });

  if (!lockTx.committed || !acquiredLock) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Donor currently has an active commitment to another requisition.'
    );
  }

  // Double-lock Step 2: Atomic transaction on /urgent_claims/{requestId}
  const claimsRef = db.ref(`urgent_claims/${requestId}`);
  let claimDisposition: string = 'CONFIRMED';
  let slotNumber = 0;

  try {
    let attempts = 0;
    while (attempts < 5) {
      attempts++;
      try {
        const claimsTx = await claimsRef.transaction((current) => {
          const unitsNeeded = requisition.unitsNeeded || 1;
          // Cap max claimable slots at ceil(unitsNeeded / 0.8) to account for deferrals
          const maxSlots = Math.ceil(unitsNeeded / 0.8);

          if (!current) {
            current = {
              requestId,
              unitsNeeded,
              maxSlots,
              slotsClaimed: 0,
              claimants: {}
            };
          }

          current.claimants = current.claimants || {};

          // Idempotency: if this donor already claimed, return existing status
          if (current.claimants[donorUid]) {
            return current;
          }

          if (current.slotsClaimed < maxSlots) {
            current.slotsClaimed = (current.slotsClaimed || 0) + 1;
            slotNumber = current.slotsClaimed;
            claimDisposition = 'CONFIRMED';
            current.claimants[donorUid] = {
              uid: donorUid,
              status: 'CONFIRMED',
              slotNumber,
              claimedAt: now
            };
          } else {
            claimDisposition = 'STANDBY';
            current.claimants[donorUid] = {
              uid: donorUid,
              status: 'STANDBY',
              claimedAt: now
            };
          }

          return current;
        });

        if (claimsTx.committed) {
          break;
        }
      } catch (txErr) {
        // Retry
      }

      if (attempts >= 5) {
        // Under extreme contention beyond retries, automatically treat donor as STANDBY (zero rejection policy)
        claimDisposition = 'STANDBY';
        break;
      }
      await new Promise(r => setTimeout(r, 25 + Math.random() * 50));
    }
  } catch (err: any) {
    // If any unexpected error occurred, gracefully fallback to STANDBY rather than throwing an error to the donor
    claimDisposition = 'STANDBY';
  }

  // Resolve collection facility destination
  const hospitalSnap = await db.ref(`masters/hospital/${requisition.hospitalId}`).get();
  const allHospitalsSnap = await db.ref('masters/hospital').get();
  const hospital = hospitalSnap.val() || { hospitalId: requisition.hospitalId };
  const allHospitals = allHospitalsSnap.val() || {};

  let targetFacility: any = null;
  try {
    targetFacility = resolveCollectionDestination(hospital, allHospitals);
  } catch (routingErr: any) {
    targetFacility = {
      destinationId: requisition.hospitalId,
      destinationType: 'HOSPITAL_COLLECTION_CENTRE',
      isBSC: false
    };
  }

  // If standby, register in standby pool
  if (claimDisposition === 'STANDBY') {
    await db.ref(`standby_pools/${requestId}/${donorUid}`).set({
      uid: donorUid,
      registeredAt: now,
      bloodGroup: donor.bloodGroup
    });
  }

  // Update donor match record
  await db.ref(`active_donor_matches/${donorUid}`).update({
    disposition: claimDisposition,
    destination: targetFacility
  });

  return {
    success: true,
    disposition: claimDisposition,
    slotNumber: claimDisposition === 'CONFIRMED' ? slotNumber : null,
    destination: targetFacility
  };
});

/**
 * -------------------------------------------------------------
 * BLOOD DRIVES & BATCH MANIFESTS (Milestone 5)
 * -------------------------------------------------------------
 */

// 9. Submit Transfer Manifest (Coordinator dispatches sealed batch)
export const submitTransferManifest = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const { campId, driveId, bagBarcodes } = request.data || {};
  if (!campId || !bagBarcodes || !Array.isArray(bagBarcodes) || bagBarcodes.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'campId and non-empty bagBarcodes array required.');
  }

  const userSnap = await db.ref(`users/${auth.uid}`).get();
  const callerProfile = userSnap.val() || {};
  if (callerProfile.role !== 'Admin' && callerProfile.campId !== campId && callerProfile.role !== 'CampCoordinator' && callerProfile.role !== 'Manager') {
    throw new functions.https.HttpsError('permission-denied', 'Only Camp Coordinators or Admins can submit transfer manifests.');
  }

  const manifestRef = db.ref('transfer_manifests').push();
  const manifestId = manifestRef.key as string;
  const now = Date.now();

  const manifestData = {
    manifestId,
    campId,
    driveId: driveId || campId,
    bagBarcodes,
    totalBags: bagBarcodes.length,
    status: 'IN_TRANSIT',
    dispatchedAt: now,
    dispatchedBy: auth.uid,
    dispatchedByName: callerProfile.name || 'Coordinator'
  };

  const updates: Record<string, any> = {};
  updates[`transfer_manifests/${manifestId}`] = manifestData;

  for (const barcode of bagBarcodes) {
    updates[`inventory/units/${barcode}/transferManifestId`] = manifestId;
    updates[`inventory/units/${barcode}/status`] = 'IN_TRANSIT';
    updates[`inventory/units/${barcode}/updatedAt`] = now;
  }

  await db.ref().update(updates);

  await logAudit(
    manifestId,
    auth.uid,
    callerProfile.name || 'Coordinator',
    'SUBMIT_TRANSFER_MANIFEST',
    'Success',
    null,
    undefined,
    undefined,
    `Batch manifest submitted with ${bagBarcodes.length} blood bags from camp ${campId}`
  );

  return { success: true, manifestId, totalBags: bagBarcodes.length };
});

// 10. Receive Batch Manifest (Storage Officer verifies batch arrival)
export const receiveBatchManifest = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const { manifestId, scannedBarcodes } = request.data || {};
  if (!manifestId || !scannedBarcodes || !Array.isArray(scannedBarcodes)) {
    throw new functions.https.HttpsError('invalid-argument', 'manifestId and scannedBarcodes array required.');
  }

  const userSnap = await db.ref(`users/${auth.uid}`).get();
  const callerProfile = userSnap.val() || {};
  if (callerProfile.role !== 'Admin' && callerProfile.role !== 'Storage') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admins can receive transfer manifests.');
  }

  const manifestSnap = await db.ref(`transfer_manifests/${manifestId}`).get();
  if (!manifestSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Transfer manifest not found.');
  }

  const manifest = manifestSnap.val();
  const expectedBarcodes = new Set<string>(manifest.bagBarcodes || []);
  const receivedSet = new Set<string>(scannedBarcodes);

  const missingBarcodes: string[] = [];
  for (const barcode of expectedBarcodes) {
    if (!receivedSet.has(barcode)) {
      missingBarcodes.push(barcode);
    }
  }

  const unmanifestedBarcodes: string[] = [];
  for (const barcode of scannedBarcodes) {
    if (!expectedBarcodes.has(barcode)) {
      unmanifestedBarcodes.push(barcode);
    }
  }

  const hasDiscrepancy = missingBarcodes.length > 0 || unmanifestedBarcodes.length > 0;
  const status = hasDiscrepancy ? 'RECEIVED_WITH_DISCREPANCY' : 'RECEIVED_VERIFIED';
  const now = Date.now();

  const updates: Record<string, any> = {};
  updates[`transfer_manifests/${manifestId}/status`] = status;
  updates[`transfer_manifests/${manifestId}/receivedAt`] = now;
  updates[`transfer_manifests/${manifestId}/receivedBy`] = auth.uid;
  updates[`transfer_manifests/${manifestId}/receivedByName`] = callerProfile.name || 'Storage Officer';
  updates[`transfer_manifests/${manifestId}/missingBarcodes`] = missingBarcodes;
  updates[`transfer_manifests/${manifestId}/unmanifestedBarcodes`] = unmanifestedBarcodes;

  // Move scanned units into Quarantine status awaiting lab certification
  for (const barcode of scannedBarcodes) {
    updates[`inventory/units/${barcode}/status`] = 'Quarantined';
    updates[`inventory/units/${barcode}/receivedAt`] = now;
    updates[`inventory/units/${barcode}/updatedAt`] = now;
  }

  await db.ref().update(updates);

  await logAudit(
    manifestId,
    auth.uid,
    callerProfile.name || 'Storage Officer',
    'RECEIVE_BATCH_MANIFEST',
    'Success',
    null,
    undefined,
    undefined,
    `Manifest ${manifestId} received with status ${status}. Scanned: ${scannedBarcodes.length}, Missing: ${missingBarcodes.length}, Extra: ${unmanifestedBarcodes.length}`
  );

  return {
    success: true,
    status,
    scannedCount: scannedBarcodes.length,
    missingBarcodes,
    unmanifestedBarcodes
  };
});

// 11. Chunked Bulk Certification (Negative Filter Invariant DEC-005 / DEC-015)
export const bulkCertifyBatch = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const { manifestId, labResults } = request.data || {};
  if (!manifestId || !labResults) {
    throw new functions.https.HttpsError('invalid-argument', 'manifestId and labResults required.');
  }

  const userSnap = await db.ref(`users/${auth.uid}`).get();
  const callerProfile = userSnap.val() || {};
  if (callerProfile.role !== 'Admin' && callerProfile.role !== 'Storage') {
    throw new functions.https.HttpsError('permission-denied', 'Only Storage Officers or Admins can certify batches.');
  }

  const resultsList: Array<{
    unitId: string;
    serologyNegative: boolean;
    componentType?: string;
    bloodGroup?: string;
    expiryEpoch?: number;
  }> = Array.isArray(labResults)
    ? labResults
    : Object.keys(labResults).map(unitId => ({ unitId, ...labResults[unitId] }));

  if (resultsList.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'labResults cannot be empty.');
  }

  const now = Date.now();
  let certifiedCount = 0;
  let discardedCount = 0;

  // Process in idempotent chunks of up to 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < resultsList.length; i += CHUNK_SIZE) {
    const chunk = resultsList.slice(i, i + CHUNK_SIZE);
    const updates: Record<string, any> = {};

    for (const item of chunk) {
      const { unitId, serologyNegative } = item;
      let { componentType, bloodGroup, expiryEpoch } = item;

      // If unit attributes missing from payload, fetch from DB
      if (!componentType || !bloodGroup || !expiryEpoch) {
        const unitSnap = await db.ref(`inventory/units/${unitId}`).get();
        if (unitSnap.exists()) {
          const uVal = unitSnap.val();
          componentType = componentType || uVal.componentType || 'WholeBlood';
          bloodGroup = bloodGroup || uVal.bloodGroup;
          expiryEpoch = expiryEpoch || (uVal.expiryDate ? new Date(uVal.expiryDate).getTime() : now + 35 * 86400000);
        }
      }

      if (serologyNegative === true) {
        certifiedCount++;
        updates[`inventory/units/${unitId}/status`] = 'Certified';
        updates[`inventory/units/${unitId}/certifiedAt`] = now;
        updates[`inventory/units/${unitId}/certifiedBy`] = auth.uid;
        updates[`inventory/units/${unitId}/updatedAt`] = now;
        if (bloodGroup && componentType && expiryEpoch) {
          updates[`inventory/fefo/${bloodGroup}_${componentType}/${expiryEpoch}_${unitId}`] = true;
        }
      } else {
        discardedCount++;
        updates[`inventory/units/${unitId}/status`] = 'Discarded';
        updates[`inventory/units/${unitId}/discardReason`] = 'SEROLOGY_REACTIVE';
        updates[`inventory/units/${unitId}/discardedAt`] = now;
        updates[`inventory/units/${unitId}/discardedBy`] = auth.uid;
        updates[`inventory/units/${unitId}/updatedAt`] = now;
      }
    }

    await db.ref().update(updates);
  }

  // Update manifest status to PROCESSED
  await db.ref(`transfer_manifests/${manifestId}`).update({
    certifiedAt: now,
    certifiedBy: auth.uid,
    certifiedCount,
    discardedCount,
    status: 'PROCESSED'
  });

  await logAudit(
    manifestId,
    auth.uid,
    callerProfile.name || 'Storage Officer',
    'BULK_CERTIFY_BATCH',
    'Success',
    null,
    undefined,
    undefined,
    `Batch ${manifestId} certified: ${certifiedCount} units certified to FEFO, ${discardedCount} discarded.`
  );

  return {
    success: true,
    certifiedCount,
    discardedCount,
    totalProcessed: resultsList.length
  };
});

// 12. Record Transfusion Impact (DPDP Act §8 Privacy Compliant Donor Notification)
export const recordTransfusionImpact = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const { unitId, city } = request.data || {};
  if (!unitId) throw new functions.https.HttpsError('invalid-argument', 'unitId required.');

  const userSnap = await db.ref(`users/${auth.uid}`).get();
  const callerProfile = userSnap.val() || {};
  if (callerProfile.role !== 'Admin' && callerProfile.role !== 'Hospital' && callerProfile.role !== 'Storage') {
    throw new functions.https.HttpsError('permission-denied', 'Only Hospital, Storage, or Admin staff can record transfusion impact.');
  }

  // Lookup unit in inventory/units
  const unitSnap = await db.ref(`inventory/units/${unitId}`).get();
  if (!unitSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'Unit not found in inventory.');
  }

  const unitData = unitSnap.val();
  const donorUid = unitData.donorUid || unitData.donorId;
  const now = Date.now();

  if (donorUid) {
    // DPDP Act §8 Privacy Compliant: only city and general impact message, zero patient or medical diagnosis data
    const impactRef = db.ref(`donor_transfusion_impacts/${donorUid}`).push();
    const impactId = impactRef.key as string;
    await impactRef.set({
      impactId,
      unitId,
      donationId: unitData.donationId || null,
      transfusedAt: now,
      city: city || 'Local District Hospital',
      message: 'Your donated blood was successfully transfused and saved a life!'
    });
  }

  // Update unit status to Transfused
  await db.ref(`inventory/units/${unitId}`).update({
    status: 'Transfused',
    transfusedAt: now,
    transfusedCity: city || 'Local District Hospital'
  });

  return {
    success: true,
    unitId,
    notifiedDonor: Boolean(donorUid)
  };
});

/**
 * -------------------------------------------------------------
 * COMMUNITY SOS APPEAL (Milestone 6)
 * -------------------------------------------------------------
 */

// 13. Authorize Community SOS Appeal (Medical Officer Gate, 2h TTL 128-bit token)
export const authorizeCommunitySOS = functions.https.onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');

  const db = admin.database();
  const { requestId } = request.data || {};
  if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'requestId required.');

  const userSnap = await db.ref(`users/${auth.uid}`).get();
  const callerProfile = userSnap.val() || {};

  // MO authorization gate: Admin, Hospital, or Medical Officer
  const isAuthorizedRole = callerProfile.role === 'Admin' || callerProfile.role === 'Hospital' || callerProfile.isMedicalOfficer === true;
  if (!isAuthorizedRole) {
    throw new functions.https.HttpsError('permission-denied', 'Only authorized Medical Officers or Admins can trigger a Community SOS appeal.');
  }

  // Fetch requisition
  let requisition: any = null;
  const directSnap = await db.ref(`blood_requests/${requestId}`).get();
  if (directSnap.exists()) {
    requisition = directSnap.val();
  } else {
    const txSnap = await db.ref('transactions/donation_request').get();
    if (txSnap.exists()) {
      txSnap.forEach(campChild => {
        if (campChild.hasChild(requestId)) {
          requisition = campChild.child(requestId).val();
        }
      });
    }
  }

  if (!requisition) throw new functions.https.HttpsError('not-found', 'Blood requisition not found.');

  // Check urgency or unfulfilled status
  const isUrgent = requisition.urgency === 'Critical' || requisition.urgency === 'Urgent';
  if (!isUrgent && requisition.status !== 'Registered') {
    throw new functions.https.HttpsError('failed-precondition', 'Community SOS appeals are strictly reserved for Urgent or Critical blood requisitions.');
  }

  // Generate 128-bit crypto token
  const token = crypto.randomBytes(16).toString('hex');
  const now = Date.now();
  const expiresAt = now + (2 * 60 * 60 * 1000); // 2 hour TTL

  const sosData = {
    token,
    requestId,
    campId: requisition.campId || 'CAMP_MAIN',
    bloodGroup: requisition.patientBloodGroup || requisition.blood_groupId || requisition.bloodGroup,
    componentType: requisition.componentType || 'WholeBlood',
    unitsNeeded: requisition.unitsNeeded || 1,
    authorizedBy: auth.uid,
    authorizedByName: callerProfile.name || 'Medical Officer',
    authorizedAt: now,
    expiresAt,
    active: true,
    pledgeCount: 0
  };

  await db.ref(`sos_links/${token}`).set(sosData);

  await logAudit(
    requestId,
    auth.uid,
    callerProfile.name || 'Medical Officer',
    'AUTHORIZE_COMMUNITY_SOS',
    'Success',
    null,
    undefined,
    undefined,
    `Community SOS appeal authorized by Medical Officer. Token expires in 2 hours.`
  );

  return {
    success: true,
    token,
    expiresAt,
    shareUrl: `https://cap23-blood-donation.web.app/sos/${token}`
  };
});

// 14. Submit Public Volunteer Pledge (Anti-DoS Capped Walk-in Registry)
export const submitPublicVolunteerPledge = functions.https.onCall(async (request) => {
  const db = admin.database();
  const { token, volunteerName, phone, bloodGroup } = request.data || {};

  if (!token || !volunteerName || !phone) {
    throw new functions.https.HttpsError('invalid-argument', 'token, volunteerName, and phone are required.');
  }

  const sosSnap = await db.ref(`sos_links/${token}`).get();
  if (!sosSnap.exists()) {
    throw new functions.https.HttpsError('not-found', 'SOS appeal link is invalid or does not exist.');
  }

  const sosData = sosSnap.val();
  const now = Date.now();

  if (!sosData.active || now > sosData.expiresAt) {
    throw new functions.https.HttpsError('deadline-exceeded', 'This Community SOS appeal link has expired.');
  }

  // Anti-DoS Volunteer Cap: Max 3x unitsNeeded
  const unitsNeeded = sosData.unitsNeeded || 1;
  const maxPledges = unitsNeeded * 3;

  const pledgeCountRef = db.ref(`sos_links/${token}/pledgeCount`);
  let capacityReached = false;

  const txnResult = await pledgeCountRef.transaction((count) => {
    const current = (typeof count === 'number') ? count : 0;
    if (current >= maxPledges) {
      capacityReached = true;
      return; // abort tx
    }
    return current + 1;
  });

  if (capacityReached || !txnResult.committed) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Pledge capacity for this emergency has been fulfilled. Thank you for your willingness to help!'
    );
  }

  const currentPledgeCount = txnResult.snapshot.val();

  // Mask phone for privacy (DPDP Act) - e.g. +91******1234
  const maskedPhone = phone.length > 4
    ? phone.slice(0, 2) + '*'.repeat(phone.length - 6) + phone.slice(-4)
    : phone;

  const pledgeRef = db.ref(`public_volunteers/${sosData.requestId}`).push();
  const pledgeId = pledgeRef.key as string;

  await pledgeRef.set({
    pledgeId,
    token,
    requestId: sosData.requestId,
    volunteerName,
    phone: maskedPhone,
    bloodGroup: bloodGroup || 'Unknown',
    pledgedAt: now,
    status: 'PLEDGED'
  });

  // CRITICAL INVARIANT: Public volunteer pledge does NOT decrement clinical unitsNeeded!

  return {
    success: true,
    pledgeId,
    pledgeNumber: currentPledgeCount,
    message: 'Thank you for your pledge! Please report to the nearest blood bank.'
  };
});
