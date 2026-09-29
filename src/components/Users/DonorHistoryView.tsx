import { useEffect, useState } from 'react';
import { ref, get, query, orderByChild } from 'firebase/database';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthProvider';
import { getCamps } from '../../services/masterService';
import type { Camp } from '../../services/masterService';

interface DonationRecord {
  requestId: string;
  donationDate: number;
  volume: number;
  componentType?: 'WholeBlood' | 'Platelets' | 'Plasma';
  campId: string;
  verifiedBy: string;
}

export const DonorHistoryView = ({ targetDonorUid }: { targetDonorUid?: string }) => {
  const { user } = useAuth();
  const [history, setHistory] = useState<DonationRecord[]>([]);
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const donorUid = targetDonorUid || user?.uid;

  useEffect(() => {
    if (!donorUid) return;
    
    const fetchHistory = async () => {
      setLoading(true);
      setError('');
      try {
        const campsData = await getCamps();
        setCamps(campsData);

        const historyRef = ref(db, `donor_history/${donorUid}`);
        const q = query(historyRef, orderByChild('donationDate'));
        const snapshot = await get(q);
        
        const records: DonationRecord[] = [];
        if (snapshot.exists()) {
          snapshot.forEach((child) => {
            records.push(child.val() as DonationRecord);
          });
        }
        
        // Reverse for newest first
        records.sort((a, b) => b.donationDate - a.donationDate);
        setHistory(records);
      } catch (err: any) {
        console.error(err);
        setError('Failed to load donor history. You may not have permission.');
      } finally {
        setLoading(false);
      }
    };
    
    fetchHistory();
  }, [donorUid]);

  if (loading) return <div className="p-4 text-slate-500">Loading history...</div>;
  if (error) return <div className="p-4 text-rose-600">{error}</div>;

  const now = Date.now();
  const msInDay = 24 * 60 * 60 * 1000;

  let latestWholeBlood = 0;
  let latestPlatelets = 0;
  let latestPlasma = 0;
  let plateletsIn7Days = 0;
  let plateletsIn365Days = 0;

  history.forEach((rec) => {
    const comp = rec.componentType || 'WholeBlood';
    const d = rec.donationDate;
    if (comp === 'WholeBlood') {
      if (d > latestWholeBlood) latestWholeBlood = d;
    } else if (comp === 'Platelets') {
      if (d > latestPlatelets) latestPlatelets = d;
      if (now - d < 7 * msInDay) plateletsIn7Days++;
      if (now - d < 365 * msInDay) plateletsIn365Days++;
    } else if (comp === 'Plasma') {
      if (d > latestPlasma) latestPlasma = d;
    }
  });

  // 1. Whole Blood Next Eligible Date
  // Requires: 90d from WB, 28d from Platelets (DGHS), 28d from Plasma
  const wbBlock1 = latestWholeBlood > 0 ? latestWholeBlood + 90 * msInDay : 0;
  const wbBlock2 = latestPlatelets > 0 ? latestPlatelets + 28 * msInDay : 0;
  const wbBlock3 = latestPlasma > 0 ? latestPlasma + 28 * msInDay : 0;
  const nextWbTime = Math.max(wbBlock1, wbBlock2, wbBlock3);
  const isWbEligible = nextWbTime <= now;

  // 2. Platelets Next Eligible Date
  // Requires: 28d from WB (DGHS), 7d from Platelets, 28d from Plasma, weekly < 2, annual < 24
  const plBlock1 = latestWholeBlood > 0 ? latestWholeBlood + 28 * msInDay : 0;
  const plBlock2 = latestPlatelets > 0 ? latestPlatelets + 7 * msInDay : 0;
  const plBlock3 = latestPlasma > 0 ? latestPlasma + 28 * msInDay : 0;
  const nextPlTime = Math.max(plBlock1, plBlock2, plBlock3);
  const isPlCapReached = plateletsIn7Days >= 2 || plateletsIn365Days >= 24;
  const isPlEligible = nextPlTime <= now && !isPlCapReached;

  // 3. Plasma Next Eligible Date
  // Requires: 28d from WB, 28d from Plasma, 7d from Platelets
  const plasBlock1 = latestWholeBlood > 0 ? latestWholeBlood + 28 * msInDay : 0;
  const plasBlock2 = latestPlasma > 0 ? latestPlasma + 28 * msInDay : 0;
  const plasBlock3 = latestPlatelets > 0 ? latestPlatelets + 7 * msInDay : 0;
  const nextPlasTime = Math.max(plasBlock1, plasBlock2, plasBlock3);
  const isPlasEligible = nextPlasTime <= now;

  return (
    <div className="space-y-6">
      {!targetDonorUid && (
         <div className="flex justify-between items-end">
           <div>
             <h1 className="text-2xl font-bold text-slate-900">My Donation History</h1>
             <p className="text-slate-600 mt-1">Track your past donations and component-specific eligibility</p>
           </div>
         </div>
      )}

      {/* Statutory Clinical Notice Banner (Decision ID-016) */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
        <span className="text-base font-bold text-amber-600">ℹ️</span>
        <div>
          <span className="font-semibold text-amber-950">Statutory Clinical Notice (NBTC / MoHFW Standards):</span>
          <p className="mt-1 text-amber-800 leading-relaxed">
            National Blood Transfusion Council regulations mandate a minimum <strong>120-day (4-month)</strong> inter-donation interval for female donors to compensate for physiological menstrual iron expenditure, compared to <strong>90 days (3 months)</strong> for male donors. The system currently computes eligibility against the 90-day statutory baseline floor. Female donors should observe the 120-day interval prior to scheduling their next whole blood donation.
          </p>
        </div>
      </div>

      {/* Component-Specific Eligibility Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Whole Blood Card */}
        <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${isWbEligible ? 'bg-blue-50/60 border-blue-200' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-800">Whole Blood</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isWbEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isWbEligible ? 'Eligible' : 'Cooldown'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {isWbEligible ? 'Eligible to Donate Now' : `Eligible on ${new Date(nextWbTime).toLocaleDateString()}`}
            </h4>
            <p className="text-xs text-slate-600 mt-1">
              90-day statutory baseline (120 days for female donors per NBTC guidelines); 28-day gap following apheresis.
            </p>
          </div>
          {!isWbEligible && (
            <div className="mt-3 text-xs font-medium text-amber-800">
              {Math.ceil((nextWbTime - now) / msInDay)} days remaining
            </div>
          )}
        </div>

        {/* Platelets Card */}
        <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${isPlEligible ? 'bg-purple-50/60 border-purple-200' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-800">Platelets (Apheresis)</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPlEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isPlEligible ? 'Eligible' : isPlCapReached ? 'Cap Reached' : 'Cooldown'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {isPlEligible 
                ? 'Eligible to Donate Now' 
                : isPlCapReached 
                  ? 'Annual or Weekly Cap Reached'
                  : `Eligible on ${new Date(nextPlTime).toLocaleDateString()}`}
            </h4>
            <p className="text-xs text-slate-600 mt-1">
              7-day interval; max 2 in 7 days & 24 in 365 days (NBTC / Schedule F).
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-purple-100">
            <div className="flex justify-between text-xs text-slate-600 mb-1">
              <span>Annual Quota</span>
              <span className="font-semibold text-purple-900">{plateletsIn365Days} / 24 used</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
              <div 
                className="bg-purple-600 h-1.5 rounded-full" 
                style={{ width: `${Math.min(100, (plateletsIn365Days / 24) * 100)}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Plasma Card */}
        <div className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${isPlasEligible ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-800">Fresh Frozen Plasma</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPlasEligible ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {isPlasEligible ? 'Eligible' : 'Cooldown'}
              </span>
            </div>
            <h4 className="text-base font-bold text-slate-900">
              {isPlasEligible ? 'Eligible to Donate Now' : `Eligible on ${new Date(nextPlasTime).toLocaleDateString()}`}
            </h4>
            <p className="text-xs text-slate-600 mt-1">
              28-day interval for plasma replenishment.
            </p>
          </div>
          {!isPlasEligible && (
            <div className="mt-3 text-xs font-medium text-amber-800">
              {Math.ceil((nextPlasTime - now) / msInDay)} days remaining
            </div>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No donations yet. Thank you for registering to save lives!
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Component</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Camp</th>
                <th className="px-6 py-3 text-left text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Volume (Units)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Request ID</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {history.map((record) => {
                const comp = record.componentType || 'WholeBlood';
                return (
                  <tr key={record.requestId}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                      {new Date(record.donationDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {comp === 'Platelets' && (
                        <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2.5 py-1 rounded-full">
                          Platelets (Apheresis)
                        </span>
                      )}
                      {comp === 'Plasma' && (
                        <span className="text-xs font-medium bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                          Plasma
                        </span>
                      )}
                      {comp === 'WholeBlood' && (
                        <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                          Whole Blood
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {camps[record.campId]?.name || record.campId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {record.volume}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400 font-mono">
                      {record.requestId.slice(-6)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
