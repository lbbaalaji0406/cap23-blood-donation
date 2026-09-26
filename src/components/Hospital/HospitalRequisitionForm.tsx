import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { hospitalService } from '../../services/hospitalService';
import { getCamps, getBloodGroups, getHospitals, DEFAULT_BLOOD_GROUPS } from '../../services/masterService';
import type { Camp, BloodGroup, Hospital } from '../../services/masterService';
import type { UrgencyLevel } from '../../services/requestService';
import { AlertCircle, CheckCircle2, Building2, Droplet, User, ArrowLeft } from 'lucide-react';

interface HospitalRequisitionFormProps {
  onSuccess?: () => void;
  onCancel?: () => void;
  isModal?: boolean;
}

export const HospitalRequisitionForm: React.FC<HospitalRequisitionFormProps> = ({
  onSuccess,
  onCancel,
  isModal = false
}) => {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [camps, setCamps] = useState<Record<string, Camp>>({});
  const [bloodGroups, setBloodGroups] = useState<Record<string, BloodGroup>>(DEFAULT_BLOOD_GROUPS);
  const [hospitals, setHospitals] = useState<Record<string, Hospital>>({});
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form Fields
  const [recipientName, setRecipientName] = useState('');
  const [patientId, setPatientId] = useState('');
  const [blood_groupId, setBloodGroupId] = useState('');
  const [componentType, setComponentType] = useState<'WholeBlood' | 'Platelets' | 'Plasma'>('WholeBlood');
  const [unitsNeeded, setUnitsNeeded] = useState<number>(1);
  const [urgency, setUrgency] = useState<UrgencyLevel>('Urgent');
  const [campId, setCampId] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const loadMasters = async () => {
      try {
        setFetching(true);
        const [cData, bgData, hData] = await Promise.all([
          getCamps(),
          getBloodGroups(),
          getHospitals()
        ]);
        setCamps(cData);
        setBloodGroups(bgData);
        setHospitals(hData);

        // Pre-select first active camp
        const activeCampKeys = Object.keys(cData).filter((k) => cData[k].active);
        if (activeCampKeys.length > 0) {
          setCampId(activeCampKeys[0]);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load master records.');
      } finally {
        setFetching(false);
      }
    };
    loadMasters();
  }, []);

  const currentHospital = profile?.hospitalId ? hospitals[profile.hospitalId] : null;
  const hospitalDisplayName = currentHospital ? `${currentHospital.name} (${currentHospital.code})` : profile?.hospitalId || 'Hospital Not Set';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!recipientName.trim()) {
      setError('Please provide the patient name.');
      return;
    }
    if (!blood_groupId) {
      setError('Please select a requested blood group.');
      return;
    }
    if (!campId) {
      setError('Please select a target fulfilling camp.');
      return;
    }
    if (!unitsNeeded || unitsNeeded < 1 || unitsNeeded > 20) {
      setError('Units needed must be between 1 and 20.');
      return;
    }

    try {
      setLoading(true);
      const res = await hospitalService.submitRequisition({
        recipientName: recipientName.trim(),
        patientId: patientId.trim(),
        blood_groupId,
        componentType,
        unitsNeeded: Number(unitsNeeded),
        urgency,
        campId,
        notes: notes.trim()
      });

      setSuccess(`Requisition submitted successfully! Request ID: ${res.requestId}`);
      setTimeout(() => {
        if (onSuccess) {
          onSuccess();
        } else {
          navigate('/dashboard');
        }
      }, 1200);
    } catch (err: any) {
      console.error('Failed to submit hospital requisition:', err);
      setError(err.message || 'Failed to submit requisition. Please check connection and permissions.');
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center p-12 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mr-3" />
        Loading requisition form...
      </div>
    );
  }

  return (
    <div className={isModal ? 'p-1' : 'max-w-4xl mx-auto p-4 sm:p-6 lg:p-8'}>
      {!isModal && (
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft size={16} className="mr-1" /> Back to Dashboard
          </button>
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 p-6 text-white">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl text-white">
              <Droplet size={26} className="fill-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight">Emergency Blood Requisition</h2>
              <p className="text-red-100 text-sm mt-0.5">
                Direct clinical order to affiliated blood camps & coordination centers
              </p>
            </div>
          </div>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-xl flex items-start gap-3 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle size={18} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex items-start gap-3 text-emerald-700 dark:text-emerald-400 text-sm">
              <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          {/* Locked Hospital Identity Banner */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg">
                <Building2 size={20} />
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">
                  Requisitioning Medical Center
                </span>
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {hospitalDisplayName}
                </span>
              </div>
            </div>
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto">
              ✓ Verified Facility Account
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Patient Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Patient Full Name <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
                />
                <User size={18} className="absolute right-3.5 top-3 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {/* Inpatient / Bed / Case Number */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Hospital IP / Bed / Case #
              </label>
              <input
                type="text"
                placeholder="e.g. IP-8921 / ICU Bed 14"
                value={patientId}
                onChange={(e) => setPatientId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Blood Group */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Blood Group Needed <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={blood_groupId}
                onChange={(e) => setBloodGroupId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-medium cursor-pointer"
              >
                <option value="">-- Select Blood Group --</option>
                {Object.entries(bloodGroups && Object.keys(bloodGroups).length > 0 ? bloodGroups : DEFAULT_BLOOD_GROUPS)
                  .filter(([, bg]) => bg.active)
                  .sort((a, b) => a[1].code.localeCompare(b[1].code))
                  .map(([id, bg]) => (
                    <option key={id} value={id}>
                      {bg.code} — {bg.name}
                    </option>
                  ))}
              </select>
            </div>

            {/* Blood Component */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Component Type <span className="text-red-500">*</span>
              </label>
              <select
                required
                value={componentType}
                onChange={(e) => setComponentType(e.target.value as any)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-medium"
              >
                <option value="WholeBlood">Whole Blood (Standard)</option>
                <option value="Platelets">Platelets (Apheresis / RDP)</option>
                <option value="Plasma">Fresh Frozen Plasma (FFP)</option>
              </select>
            </div>

            {/* Units Needed */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Units Needed <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                max={20}
                required
                value={unitsNeeded}
                onChange={(e) => setUnitsNeeded(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-semibold"
              />
            </div>
          </div>

          {/* Urgency Selector */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Clinical Urgency Level <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                { level: 'Routine', label: 'Routine (Elective / Stable)', color: 'border-blue-300 text-blue-700 bg-blue-50/50 dark:bg-blue-900/20' },
                { level: 'Urgent', label: 'Urgent (Needed within 4h)', color: 'border-amber-300 text-amber-700 bg-amber-50/50 dark:bg-amber-900/20' },
                { level: 'Critical', label: 'Critical (Immediate / ICU)', color: 'border-red-300 text-red-700 bg-red-50/50 dark:bg-red-900/20' }
              ].map((item) => {
                const isSelected = urgency === item.level;
                return (
                  <button
                    key={item.level}
                    type="button"
                    onClick={() => setUrgency(item.level as UrgencyLevel)}
                    className={`p-3 rounded-xl border text-sm font-medium text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? `${item.color} ring-2 ring-primary border-transparent font-bold shadow-sm`
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <span>{item.label}</span>
                    {isSelected && <CheckCircle2 size={16} className="text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Fulfilling Camp Routing */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Target Fulfilling Camp / Blood Center <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={campId}
              onChange={(e) => setCampId(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm font-medium"
            >
              <option value="">-- Select Active Camp --</option>
              {Object.entries(camps)
                .filter(([, camp]) => camp.active)
                .map(([id, camp]) => (
                  <option key={id} value={id}>
                    {camp.name} ({camp.code})
                  </option>
                ))}
            </select>
            <p className="text-xs text-slate-500 mt-1">
              Select the active camp or regional bank closest to your hospital for optimal phlebotomy and transport dispatch.
            </p>
          </div>

          {/* Clinical Indications & Notes */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Clinical Indication / Diagnosis Remarks
            </label>
            <textarea
              rows={3}
              placeholder="e.g. Platelet count: 12,000/µL with active gastrointestinal bleeding. Scheduled for emergency laparotomy."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary text-sm"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                className="px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-primary hover:bg-primary-hover disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Submitting Order...
                </>
              ) : (
                <>
                  <Droplet size={16} className="fill-white" />
                  Submit Blood Requisition
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
