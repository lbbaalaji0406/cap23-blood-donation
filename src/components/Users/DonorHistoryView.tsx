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

  const mostRecent = history.length > 0 ? history[0].donationDate : null;
  let nextEligibleDate = null;
  let isEligible = true;

  if (mostRecent) {
    const nextDate = new Date(mostRecent);
    nextDate.setDate(nextDate.getDate() + 90);
    nextEligibleDate = nextDate;
    if (nextDate.getTime() > Date.now()) {
      isEligible = false;
    }
  }

  return (
    <div className="space-y-6">
      {!targetDonorUid && (
         <div className="flex justify-between items-end">
           <div>
             <h1 className="text-2xl font-bold text-slate-900">My Donation History</h1>
             <p className="text-slate-600 mt-1">Track your past donations and eligibility</p>
           </div>
         </div>
      )}

      {/* Eligibility Card */}
      <div className={`p-6 rounded-xl border shadow-sm ${isEligible ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <h3 className={`text-lg font-bold mb-1 ${isEligible ? 'text-emerald-900' : 'text-amber-900'}`}>
          {isEligible ? 'You are eligible to donate!' : 'Not currently eligible'}
        </h3>
        <p className={`text-sm ${isEligible ? 'text-emerald-700' : 'text-amber-700'}`}>
          {isEligible 
            ? 'It has been more than 90 days since your last donation, or you have no prior donations recorded.'
            : `You must wait 90 days between donations. You will be eligible again on ${nextEligibleDate?.toLocaleDateString()}.`
          }
        </p>
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
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Camp</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Volume (Units)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Request ID</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {history.map((record) => (
                <tr key={record.requestId}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                    {new Date(record.donationDate).toLocaleDateString()}
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
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
