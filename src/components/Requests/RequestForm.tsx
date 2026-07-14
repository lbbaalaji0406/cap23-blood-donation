import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { requestService } from '../../services/requestService';
import type { DonationRequest, UrgencyLevel } from '../../services/requestService';
import { getCamps, getBloodGroups, getHospitals } from '../../services/masterService';
import type { Camp, BloodGroup, Hospital } from '../../services/masterService';

export const RequestForm = () => {
  const { campId: routeCampId, id } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  
  const isEdit = Boolean(id);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  // Master data for dropdowns
  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>({});
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});

  // Form State
  const [recipientName, setRecipientName] = useState('');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<UrgencyLevel>('Routine');
  const [blood_groupId, setBloodGroupId] = useState('');
  const [recipientHospitalId, setRecipientHospitalId] = useState('');
  const [campId, setCampId] = useState(''); // Only visible/editable for Admin on CREATE

  useEffect(() => {
    const init = async () => {
      try {
        const [cData, bgData, hData] = await Promise.all([
          getCamps(),
          getBloodGroups(),
          getHospitals()
        ]);
        setCamps(cData);
        setBloodGroups(bgData);
        setHospitals(hData);

        if (isEdit && id) {
          const req = await requestService.getRequest(routeCampId!, id);
          if (req) {
            setRecipientName(req.recipientName);
            setUnitsNeeded(req.unitsNeeded);
            setUrgency(req.urgency);
            setBloodGroupId(req.blood_groupId);
            setRecipientHospitalId(req.recipientHospitalId);
            setCampId(req.campId || '');
          } else {
            navigate('/requests');
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setFetching(false);
      }
    };
    init();
  }, [id, routeCampId, isEdit, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!recipientName || !blood_groupId || !recipientHospitalId || !unitsNeeded) {
      alert("Please fill in all required fields.");
      return;
    }

    if (!isEdit && profile?.role === 'Admin' && !campId) {
      alert("Admin must explicitly select a Camp.");
      return;
    }

    setLoading(true);
    try {
      const payload: Partial<DonationRequest> = {
        recipientName,
        unitsNeeded,
        urgency,
        blood_groupId,
        recipientHospitalId,
      };

      // Admin must pass the campId (either selected on Create, or loaded into state on Edit)
      if (profile?.role === 'Admin') {
        payload.campId = campId;
      }

      await requestService.saveDonationRequest(
        id || null, 
        payload, 
        user!.uid, 
        profile?.role === 'Manager' ? profile.campId : undefined
      );

      navigate('/requests');
    } catch (err: any) {
      alert("Error saving request: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="p-6">Loading...</div>;

  return (
    <div className="max-w-2xl mx-auto p-6 bg-white rounded-xl shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-900">
          {isEdit ? 'Edit Donation Request' : 'New Donation Request'}
        </h2>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* For Admin on Create, show Camp Dropdown */}
        {!isEdit && profile?.role === 'Admin' && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Camp</label>
            <select
              value={campId}
              onChange={(e) => setCampId(e.target.value)}
              className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
              required
            >
              <option value="">-- Select Camp --</option>
              {Object.entries(camps).map(([key, camp]) => (
                <option key={key} value={key}>{camp.name} ({camp.code})</option>
              ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">Admin must assign this request to a specific camp.</p>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Recipient Name</label>
          <input
            type="text"
            required
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Blood Group</label>
            <select
              required
              value={blood_groupId}
              onChange={(e) => setBloodGroupId(e.target.value)}
              className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- Select Blood Group --</option>
              {Object.entries(bloodGroups).map(([key, bg]) => (
                <option key={key} value={key}>{bg.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Units Needed</label>
            <input
              type="number"
              min="1"
              required
              value={unitsNeeded}
              onChange={(e) => setUnitsNeeded(parseInt(e.target.value) || 1)}
              className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Hospital</label>
            <select
              required
              value={recipientHospitalId}
              onChange={(e) => setRecipientHospitalId(e.target.value)}
              className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
            >
              <option value="">-- Select Hospital --</option>
              {Object.entries(hospitals).map(([key, hosp]) => (
                <option key={key} value={key}>{hosp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Urgency</label>
            <select
              value={urgency}
              onChange={(e) => setUrgency(e.target.value as UrgencyLevel)}
              className="w-full rounded-lg border-slate-300 border p-2 focus:border-indigo-500 focus:ring-indigo-500 outline-none"
            >
              <option value="Routine">Routine</option>
              <option value="Urgent">Urgent</option>
              <option value="Critical">Critical</option>
            </select>
          </div>
        </div>

        <div className="pt-4 flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/requests')}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Request'}
          </button>
        </div>
      </form>
    </div>
  );
};
