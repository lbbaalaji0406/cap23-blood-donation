import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { requestService } from '../../services/requestService';
import type { DonationRequest } from '../../services/requestService';
import { getCamps, getHospitals, getBloodGroups } from '../../services/masterService';
import type { Camp, Hospital, BloodGroup } from '../../services/masterService';

const statusFlow = ['Registered', 'Verified', 'Matched', 'Donated', 'Closed'];
const unfulfilledState = 'Unfulfilled';

export const RequestDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  
  const [request, setRequest] = useState<DonationRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>({});
  
  const [activeTab, setActiveTab] = useState<'details'|'comments'|'attachments'|'audit'>('details');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        if (!id) return;
        const req = await requestService.getRequest(id);
        if (!req) {
          setError('Donation Request not found.');
          setLoading(false);
          return;
        }

        const [cData, hData, bgData] = await Promise.all([
          getCamps(),
          getHospitals(),
          getBloodGroups()
        ]);
        
        setCamps(cData);
        setHospitals(hData);
        setBloodGroups(bgData);
        setRequest(req);
      } catch (err: any) {
        console.error(err);
        // This will catch the Firebase permission_denied error if a Manager tries to access another camp's request
        setError(err.message || 'Access Denied or Failed to load request.');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  if (loading) return <div className="p-6">Loading...</div>;

  if (error || !request) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-4">
          {error || 'Request not found.'}
        </div>
        <button onClick={() => navigate('/requests')} className="text-indigo-600 hover:text-indigo-900 font-medium">
          &larr; Back to Requests
        </button>
      </div>
    );
  }

  // Determine current index for the timeline
  const currentIndex = statusFlow.indexOf(request.status);
  const isUnfulfilled = request.status === unfulfilledState;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/requests')} className="text-slate-400 hover:text-slate-600">
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-slate-900">Request {request.id.slice(-6)}</h1>
        </div>
        <button 
          onClick={() => navigate(`/requests/${request.id}/edit`)}
          className="px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-medium text-sm shadow-sm"
        >
          Edit Fields
        </button>
      </div>

      {/* Status Timeline Visualization */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-sm font-medium text-slate-500 uppercase tracking-wider mb-4">Workflow Status</h3>
        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-100 z-0 rounded"></div>
          {/* Main flow */}
          {statusFlow.map((s, idx) => {
            let stateClass = "bg-slate-100 text-slate-400 border-2 border-white";
            if (s === request.status) {
              stateClass = "bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50";
            } else if (!isUnfulfilled && currentIndex >= idx) {
              stateClass = "bg-indigo-100 text-indigo-600 border-2 border-white";
            }
            return (
              <div key={s} className={`relative z-10 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${stateClass}`}>
                {s}
              </div>
            );
          })}
        </div>
        {isUnfulfilled && (
          <div className="mt-4 flex justify-center">
             <div className="bg-rose-600 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-md">
                Unfulfilled
             </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="border-b border-slate-200 flex">
          {['details', 'comments', 'attachments', 'audit'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-6 py-4 text-sm font-medium capitalize ${
                activeTab === tab 
                  ? 'border-b-2 border-indigo-600 text-indigo-600' 
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-6">
          {activeTab === 'details' && (
            <div className="grid grid-cols-2 gap-y-6 gap-x-8">
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Recipient Name</label>
                <div className="text-base font-medium text-slate-900">{request.recipientName}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Camp</label>
                <div className="text-base text-slate-900">{camps[request.campId]?.name || request.campId}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Blood Group</label>
                <div className="text-base font-medium text-indigo-700 bg-indigo-50 inline-block px-2 py-0.5 rounded">
                  {bloodGroups[request.blood_groupId]?.name || request.blood_groupId}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Units Needed</label>
                <div className="text-base text-slate-900">{request.unitsNeeded}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Urgency</label>
                <div className="text-base text-slate-900">{request.urgency}</div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Hospital</label>
                <div className="text-base text-slate-900">{hospitals[request.recipientHospitalId]?.name || request.recipientHospitalId}</div>
              </div>
            </div>
          )}
          
          {activeTab === 'comments' && (
             <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <p className="font-medium text-slate-900 mb-1">Comments Module</p>
                <p className="text-sm">Coming in Day 4</p>
             </div>
          )}

          {activeTab === 'attachments' && (
             <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <p className="font-medium text-slate-900 mb-1">Attachments Module</p>
                <p className="text-sm">Coming in Day 4</p>
             </div>
          )}

          {activeTab === 'audit' && (
             <div className="text-center py-12 text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                <p className="font-medium text-slate-900 mb-1">Audit Logs</p>
                <p className="text-sm">Coming in Day 4</p>
             </div>
          )}
        </div>
      </div>
    </div>
  );
};
