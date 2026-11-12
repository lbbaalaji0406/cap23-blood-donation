import { BloodComponentType, Clock, DonorEligibilityResult, DonorCooldownRecord } from './types';

export const TRANSFUSION_CONFIG = {
  // Standalone inter-donation intervals (in days)
  WHOLE_BLOOD_INTERVAL_DAYS: 90,        // Universal baseline floor (MoHFW / Drugs & Cosmetics Rules)
  WHOLE_BLOOD_FEMALE_INTERVAL_DAYS: 120, // NBTC guideline for female donors
  PLATELET_INTERVAL_DAYS: 7,             // 7-day safe camp interval (statutory min is 48 hours)
  PLASMA_INTERVAL_DAYS: 28,             // Standard plasma replenishment interval

  // Cross-component intervals (in days)
  WB_TO_APHERESIS_DAYS: 28,             // Whole Blood -> Apheresis (DGHS Technical Manual)
  APHERESIS_TO_WB_DAYS: 28,             // Apheresis -> Whole Blood (DGHS Technical Manual)

  // Apheresis statutory safety caps (Drugs & Cosmetics Rules, Schedule F, Part XII-B)
  MAX_PLATELET_DONATIONS_7_DAYS: 2,      // Max 2 times in 7 days
  MAX_PLATELET_DONATIONS_365_DAYS: 24    // Max 24 times in 365 days
};

export const MATCH_TIMEOUT_CONFIG = {
  Critical: 15 * 60 * 1000,
  Urgent: 2 * 60 * 60 * 1000,
  Routine: 24 * 60 * 60 * 1000
};

export function evaluateDonorEligibility(
  historyRecords: DonorCooldownRecord[],
  requestedComponent: BloodComponentType = 'WholeBlood',
  clock: Clock = () => Date.now()
): DonorEligibilityResult {
  const now = clock();
  let latestWholeBloodDate = 0;
  let latestPlateletDate = 0;
  let latestPlasmaDate = 0;

  const plateletTimestampsPast7Days: number[] = [];
  const plateletTimestampsPast365Days: number[] = [];

  const ms7DaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const ms365DaysAgo = now - 365 * 24 * 60 * 60 * 1000;

  for (const record of historyRecords) {
    if (!record || !record.donationDate) continue;
    const donationTime = typeof record.donationDate === 'number'
      ? record.donationDate
      : new Date(record.donationDate).getTime();

    if (isNaN(donationTime)) continue;

    const component = record.componentType || 'WholeBlood';

    if (component === 'WholeBlood') {
      if (donationTime > latestWholeBloodDate) latestWholeBloodDate = donationTime;
    } else if (component === 'Platelets') {
      if (donationTime > latestPlateletDate) latestPlateletDate = donationTime;
      if (donationTime >= ms7DaysAgo) plateletTimestampsPast7Days.push(donationTime);
      if (donationTime >= ms365DaysAgo) plateletTimestampsPast365Days.push(donationTime);
    } else if (component === 'Plasma') {
      if (donationTime > latestPlasmaDate) latestPlasmaDate = donationTime;
    }
  }

  const latestApheresisDate = Math.max(latestPlateletDate, latestPlasmaDate);

  if (requestedComponent === 'WholeBlood') {
    if (latestWholeBloodDate > 0) {
      const daysSinceWB = (now - latestWholeBloodDate) / (1000 * 60 * 60 * 24);
      if (daysSinceWB < TRANSFUSION_CONFIG.WHOLE_BLOOD_INTERVAL_DAYS) {
        const nextEligible = new Date(latestWholeBloodDate + TRANSFUSION_CONFIG.WHOLE_BLOOD_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Whole blood cooldown active (${Math.ceil(TRANSFUSION_CONFIG.WHOLE_BLOOD_INTERVAL_DAYS - daysSinceWB)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }

    if (latestApheresisDate > 0) {
      const daysSinceApheresis = (now - latestApheresisDate) / (1000 * 60 * 60 * 24);
      if (daysSinceApheresis < TRANSFUSION_CONFIG.APHERESIS_TO_WB_DAYS) {
        const nextEligible = new Date(latestApheresisDate + TRANSFUSION_CONFIG.APHERESIS_TO_WB_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Apheresis to Whole Blood deferral active (${Math.ceil(TRANSFUSION_CONFIG.APHERESIS_TO_WB_DAYS - daysSinceApheresis)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }
  } else if (requestedComponent === 'Platelets') {
    if (plateletTimestampsPast7Days.length >= TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_7_DAYS) {
      return {
        isEligible: false,
        reason: `Maximum statutory platelet donation limit reached for rolling 7-day period (Max ${TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_7_DAYS})`
      };
    }

    if (plateletTimestampsPast365Days.length >= TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_365_DAYS) {
      return {
        isEligible: false,
        reason: `Maximum statutory platelet donation limit reached for rolling 365-day year (Max ${TRANSFUSION_CONFIG.MAX_PLATELET_DONATIONS_365_DAYS})`
      };
    }

    if (latestWholeBloodDate > 0) {
      const daysSinceWB = (now - latestWholeBloodDate) / (1000 * 60 * 60 * 24);
      if (daysSinceWB < TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS) {
        const nextEligible = new Date(latestWholeBloodDate + TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Whole Blood to Apheresis deferral active (${Math.ceil(TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS - daysSinceWB)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }

    if (latestPlateletDate > 0) {
      const daysSincePlatelets = (now - latestPlateletDate) / (1000 * 60 * 60 * 24);
      if (daysSincePlatelets < TRANSFUSION_CONFIG.PLATELET_INTERVAL_DAYS) {
        const nextEligible = new Date(latestPlateletDate + TRANSFUSION_CONFIG.PLATELET_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Platelet donation cooldown active (${Math.ceil(TRANSFUSION_CONFIG.PLATELET_INTERVAL_DAYS - daysSincePlatelets)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }
  } else if (requestedComponent === 'Plasma') {
    if (latestWholeBloodDate > 0) {
      const daysSinceWB = (now - latestWholeBloodDate) / (1000 * 60 * 60 * 24);
      if (daysSinceWB < TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS) {
        const nextEligible = new Date(latestWholeBloodDate + TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Whole Blood to Apheresis deferral active (${Math.ceil(TRANSFUSION_CONFIG.WB_TO_APHERESIS_DAYS - daysSinceWB)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }

    if (latestPlasmaDate > 0) {
      const daysSincePlasma = (now - latestPlasmaDate) / (1000 * 60 * 60 * 24);
      if (daysSincePlasma < TRANSFUSION_CONFIG.PLASMA_INTERVAL_DAYS) {
        const nextEligible = new Date(latestPlasmaDate + TRANSFUSION_CONFIG.PLASMA_INTERVAL_DAYS * 24 * 60 * 60 * 1000);
        return {
          isEligible: false,
          reason: `Plasma donation cooldown active (${Math.ceil(TRANSFUSION_CONFIG.PLASMA_INTERVAL_DAYS - daysSincePlasma)} days remaining)`,
          nextEligibleDate: nextEligible.toISOString()
        };
      }
    }
  }

  return { isEligible: true };
}
