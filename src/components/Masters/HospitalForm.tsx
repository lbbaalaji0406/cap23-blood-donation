import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthProvider';
import { useRTDB } from '../../hooks/useRTDB';
import type { Hospital } from '../../services/masterService';
import { saveHospital, sanitizeId } from '../../services/masterService';
import { ArrowLeft, Save } from 'lucide-react';

export const HospitalForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const isNew = !id;

  const { data: allHospitals, loading } = useRTDB<Record<string, Hospital>>('masters/hospital');
  
  const [formData, setFormData] = useState<Partial<Hospital>>({
    name: '',
    code: '',
    address: '',
    active: true
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNew && allHospitals && id && allHospitals[id]) {
      setFormData(allHospitals[id]);
    }
  }, [allHospitals, id, isNew]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    
    if (!formData.code || !formData.name || !formData.address) {
      setError(`Code, Name, and Address are required.`);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Hospital = {
        name: formData.name,
        code: formData.code,
        address: formData.address,
        active: formData.active ?? true,
        createdAt: formData.createdAt || new Date().toISOString(),
        createdBy: formData.createdBy || profile.email
      };

      await saveHospital(payload);
      navigate('/masters/hospital');
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loading && !isNew) return <div className="p-6">Loading...</div>;

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="p-6 border-b border-slate-200 bg-white flex items-center gap-4">
        <Link to="/masters/hospital" className="p-2 -ml-2 text-slate-400 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h2 className="text-lg font-bold text-slate-900">{isNew ? 'New Hospital' : 'Edit Hospital'}</h2>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <form onSubmit={handleSubmit} className="max-w-2xl bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Code</label>
              <input
                type="text"
                required
                disabled={!isNew}
                value={formData.code || ''}
                onChange={e => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                placeholder="e.g. HOSP01"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:bg-slate-50 disabled:text-slate-500"
              />
              {!isNew && <p className="text-xs text-slate-500">Code cannot be changed after creation.</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Name</label>
              <input
                type="text"
                required
                value={formData.name || ''}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. City General Hospital"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Address</label>
            <textarea
              required
              rows={3}
              value={formData.address || ''}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="Full address of the hospital"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={e => setFormData({ ...formData, active: e.target.checked })}
                className="w-4 h-4 text-primary rounded border-slate-300 focus:ring-primary"
              />
              <span className="text-sm font-medium text-slate-700">Active</span>
            </label>
          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-lg hover:bg-indigo-600 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? 'Saving...' : 'Save Hospital'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
