import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { requestService } from '../../services/requestService';
import type { DonationRequest } from '../../services/requestService';
import { getCamps, getHospitals, getBloodGroups } from '../../services/masterService';
import type { Camp, Hospital, BloodGroup } from '../../services/masterService';
import { useAuth } from '../../contexts/AuthProvider';

const statusColors: Record<string, string> = {
  Registered: 'bg-amber-100 text-amber-800',
  Verified: 'bg-cyan-100 text-cyan-800',
  Matched: 'bg-indigo-100 text-indigo-800',
  Donated: 'bg-emerald-100 text-emerald-800',
  Closed: 'bg-slate-100 text-slate-800',
  Unfulfilled: 'bg-rose-100 text-rose-800',
};

export const RequestList = () => {
  const [requests, setRequests] = useState<DonationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Master data for display names and filtering
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>({});
  
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Filters
  const [filterCamp, setFilterCamp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [cData, hData, bgData] = await Promise.all([
          getCamps(),
          getHospitals(),
          getBloodGroups()
        ]);
        setCamps(cData);
        setHospitals(hData);
        setBloodGroups(bgData);

        const data = await requestService.getAllRequests(profile?.role, profile?.campId);
        setRequests(data);
      } catch (err: any) {
        console.error("Error fetching requests:", err);
        setError(err.message || 'Failed to load requests');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [profile]);

  const filteredRequests = requests.filter(req => {
    if (filterCamp && req.campId !== filterCamp) return false;
    if (filterStatus && req.status !== filterStatus) return false;
    return true;
  });

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Donation Requests</h1>
        <button
          onClick={() => navigate('/requests/new')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
        >
          + New Request
        </button>
      </div>

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-6 p-4 flex gap-4">
        {profile?.role === 'Admin' && (
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-500 mb-1">Filter by Camp</label>
            <select
              value={filterCamp}
              onChange={(e) => setFilterCamp(e.target.value)}
              className="w-full rounded-md border-slate-300 border p-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 outline-none"
            >
              <option value="">All Camps</option>
              {Object.entries(camps).map(([id, camp]) => (
                <option key={id} value={id}>{camp.name}</option>
              ))}
            </select>
          </div>
        )}
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-1">Filter by Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="w-full rounded-md border-slate-300 border p-2 text-sm focus:border-indigo-500 focus:ring-indigo-500 outline-none"
          >
            <option value="">All Statuses</option>
            {Object.keys(statusColors).map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {filteredRequests.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            No donation requests found matching your filters.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Recipient</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Blood Group</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Hospital</th>
                {profile?.role === 'Admin' && (
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Camp</th>
                )}
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-slate-900">{req.recipientName}</div>
                    <div className="text-xs text-slate-500">{req.unitsNeeded} units • {req.urgency}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                      {bloodGroups[req.blood_groupId]?.name || req.blood_groupId}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                    {hospitals[req.recipientHospitalId]?.name || req.recipientHospitalId}
                  </td>
                  {profile?.role === 'Admin' && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                      {camps[req.campId || '']?.name || req.campId}
                    </td>
                  )}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[req.status] || 'bg-slate-100 text-slate-800'}`}>
                      {req.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button
                      onClick={() => navigate(`/requests/${req.campId}/${req.id}`)}
                      className="text-indigo-600 hover:text-indigo-900 mr-4"
                    >
                      View
                    </button>
                    <button
                      onClick={() => navigate(`/requests/${req.campId}/${req.id}/edit`)}
                      className="text-slate-600 hover:text-slate-900"
                    >
                      Edit
                    </button>
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
