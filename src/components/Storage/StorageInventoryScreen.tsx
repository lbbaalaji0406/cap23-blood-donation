import React, { useState, useEffect } from 'react';
import { 
  Database, 
  ShieldCheck, 
  RotateCcw, 
  PlusCircle, 
  Search, 
  Barcode, 
  Thermometer, 
  Layers,
  Clock,
  AlertTriangle
} from 'lucide-react';
import { storageService } from '../../services/storageService';
import type { StorageUnit } from '../../services/storageService';

export const StorageInventoryScreen = () => {
  const [units, setUnits] = useState<StorageUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'inventory' | 'quarantine' | 'returns' | 'reconciliation'>('inventory');
  const [searchFilter, setSearchFilter] = useState('');
  const [groupFilter, setGroupFilter] = useState('ALL');

  // Intake Modal
  const [showIntakeModal, setShowIntakeModal] = useState(false);
  const [intakeBarcode, setIntakeBarcode] = useState('');
  const [intakeGroup, setIntakeGroup] = useState('O_plus');
  const [intakeComponent, setIntakeComponent] = useState<'WholeBlood' | 'Platelets' | 'Plasma'>('WholeBlood');
  const [intakeVolume, setIntakeVolume] = useState(350);
  const [intakePreservative, setIntakePreservative] = useState<'CPDA-1' | 'SAGM' | 'None'>('CPDA-1');
  const [intakeLocation, setIntakeLocation] = useState('Bay-A1');
  const [intakeTemp, setIntakeTemp] = useState(4);

  // Certify Modal
  const [certifyingUnit, setCertifyingUnit] = useState<StorageUnit | null>(null);
  const [certLabGroup, setCertLabGroup] = useState('O_plus');
  const [certRh, setCertRh] = useState<'Positive' | 'Negative'>('Positive');
  const [ttiHiv, setTtiHiv] = useState('LOT-HIV-2026-X1');
  const [ttiHbv, setTtiHbv] = useState('LOT-HBV-2026-X1');
  const [ttiHcv, setTtiHcv] = useState('LOT-HCV-2026-X1');
  const [ttiMalaria, setTtiMalaria] = useState('LOT-MAL-2026-X1');
  const [ttiSyphilis, setTtiSyphilis] = useState('LOT-SYP-2026-X1');

  // Return Modal
  const [returningUnit, setReturningUnit] = useState<StorageUnit | null>(null);
  const [returnTemp, setReturnTemp] = useState(6);
  const [coldChainIntact, setColdChainIntact] = useState(true);

  // Reconciliation State
  const [reconcilingUnit, setReconcilingUnit] = useState<StorageUnit | null>(null);
  const [reconcileAction, setReconcileAction] = useState<'restore' | 'discard'>('restore');
  const [reconcileReason, setReconcileReason] = useState('Physical check verified unit remains intact in chiller');
  const [isSweeping, setIsSweeping] = useState(false);

  // Notification message
  const [actionMessage, setActionMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const fetchUnits = async () => {
    try {
      setLoading(true);
      const data = await storageService.getInventoryUnits();
      setUnits(data);
    } catch (err: any) {
      console.error('Failed to load inventory:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUnits();
  }, []);

  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await storageService.intakeUnit({
        bagBarcode: intakeBarcode || `BAG-${Date.now().toString().slice(-6)}`,
        bloodGroup: intakeGroup,
        componentType: intakeComponent,
        volumeMl: Number(intakeVolume),
        preservativeSolution: intakePreservative,
        storageTemperatureCelsius: Number(intakeTemp),
        storageLocation: intakeLocation
      });
      setShowIntakeModal(false);
      setActionMessage({ text: 'Blood unit received into Quarantine! Awaiting lab TTI certification.', type: 'success' });
      fetchUnits();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Intake failed', type: 'error' });
    }
  };

  const handleCertifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!certifyingUnit) return;
    try {
      await storageService.certifyUnit({
        unitId: certifyingUnit.unitId,
        labConfirmedBloodGroup: certLabGroup,
        rhTyping: certRh,
        ttiLotNumbers: {
          hivLot: ttiHiv,
          hbvLot: ttiHbv,
          hcvLot: ttiHcv,
          malariaLot: ttiMalaria,
          syphilisLot: ttiSyphilis
        }
      });
      setCertifyingUnit(null);
      setActionMessage({ text: `Unit ${certifyingUnit.bagBarcode} CERTIFIED safe for transfusion and placed on active shelf!`, type: 'success' });
      fetchUnits();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Certification failed (maker-checker check)', type: 'error' });
    }
  };

  const handleReturnSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!returningUnit) return;
    try {
      const res = await storageService.processReturn({
        unitId: returningUnit.unitId,
        coldChainIntact,
        returnTempCelsius: Number(returnTemp)
      });
      setReturningUnit(null);
      setActionMessage({ text: `Return processed: Unit transitioned to ${res.status} (Elapsed: ${Math.round(res.elapsedMinutes)} mins).`, type: 'success' });
      fetchUnits();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Return processing failed', type: 'error' });
    }
  };

  const handleSweepTimeouts = async () => {
    try {
      setIsSweeping(true);
      const res = await storageService.sweepScanTimeouts();
      setActionMessage({
        text: `Watchdog Sweep completed: ${res.processedCount} expired reserved unit(s) quarantined to ISSUE_UNCONFIRMED.`,
        type: 'success'
      });
      fetchUnits();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Failed to sweep scan timeouts', type: 'error' });
    } finally {
      setIsSweeping(false);
    }
  };

  const handleReconcileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reconcilingUnit) return;
    try {
      const res = await storageService.reconcileUnconfirmed({
        unitId: reconcilingUnit.unitId,
        physicalCheckPassed: reconcileAction === 'restore',
        reason: reconcileReason
      });
      setReconcilingUnit(null);
      setActionMessage({
        text: `Reconciliation complete: Unit ${reconcilingUnit.bagBarcode} transitioned to ${res.status}.`,
        type: 'success'
      });
      fetchUnits();
    } catch (err: any) {
      setActionMessage({ text: err.message || 'Reconciliation failed', type: 'error' });
    }
  };

  const getExpiryBadge = (expiryDate: string | number) => {
    const expiryTime = typeof expiryDate === 'number' ? expiryDate : new Date(expiryDate).getTime();
    const daysLeft = Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">EXPIRED</span>;
    }
    if (daysLeft <= 3) {
      return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800">{daysLeft}d left (CRITICAL FEFO)</span>;
    }
    return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">{daysLeft}d left</span>;
  };

  const filteredUnits = units.filter(u => {
    const matchesSearch = u.bagBarcode?.toLowerCase().includes(searchFilter.toLowerCase()) ||
                          u.storageLocation?.toLowerCase().includes(searchFilter.toLowerCase());
    const matchesGroup = groupFilter === 'ALL' || u.bloodGroup === groupFilter;
    if (activeTab === 'inventory') return matchesSearch && matchesGroup && (u.status === 'Certified' || u.status === 'Stock_Reserved');
    if (activeTab === 'quarantine') return matchesSearch && matchesGroup && u.status === 'Quarantined';
    if (activeTab === 'reconciliation') return matchesSearch && matchesGroup && u.status === 'ISSUE_UNCONFIRMED';
    if (activeTab === 'returns') return matchesSearch && matchesGroup && (u.status === 'Dispatched' || u.status === 'Returned' || u.status === 'Discarded');
    return true;
  });

  return (
    <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Central Cold Storage & Blood Bank</h1>
              <p className="text-sm text-slate-500">Quality gatekeeper, FEFO shelf allocation, and statutory TTI serology certification</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSweepTimeouts}
            disabled={isSweeping}
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            title="Scan watchdog checks for reserved units not dispatched within 10 minutes"
          >
            <Clock size={16} className={isSweeping ? 'animate-spin' : ''} />
            {isSweeping ? 'Sweeping...' : 'Run Watchdog Sweep'}
          </button>
          <button
            onClick={() => setShowIntakeModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <PlusCircle size={16} />
            Receive Bag in Quarantine
          </button>
        </div>
      </div>

      {actionMessage && (
        <div className={`p-4 rounded-lg flex items-center justify-between text-sm ${actionMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
          <span>{actionMessage.text}</span>
          <button onClick={() => setActionMessage(null)} className="font-bold underline ml-4">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 gap-6">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'inventory' ? 'border-rose-600 text-rose-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <Layers size={16} />
          Certified Active Shelf ({units.filter(u => u.status === 'Certified' || u.status === 'Stock_Reserved').length})
        </button>
        <button
          onClick={() => setActiveTab('quarantine')}
          className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'quarantine' ? 'border-amber-600 text-amber-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <ShieldCheck size={16} />
          Quarantine & TTI Testing Queue ({units.filter(u => u.status === 'Quarantined').length})
        </button>
        <button
          onClick={() => setActiveTab('reconciliation')}
          className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'reconciliation' ? 'border-purple-600 text-purple-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <AlertTriangle size={16} />
          Unconfirmed Reconciliation ({units.filter(u => u.status === 'ISSUE_UNCONFIRMED').length})
        </button>
        <button
          onClick={() => setActiveTab('returns')}
          className={`pb-3 text-sm font-medium border-b-2 flex items-center gap-2 transition-colors ${activeTab === 'returns' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
        >
          <RotateCcw size={16} />
          Returns & Dispatches ({units.filter(u => u.status === 'Dispatched' || u.status === 'Returned' || u.status === 'Discarded').length})
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search by Bag Barcode or Shelf Bay..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-medium">Blood Group:</span>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <option value="ALL">All Groups</option>
            <option value="A_plus">A+</option>
            <option value="A_minus">A-</option>
            <option value="B_plus">B+</option>
            <option value="B_minus">B-</option>
            <option value="AB_plus">AB+</option>
            <option value="AB_minus">AB-</option>
            <option value="O_plus">O+</option>
            <option value="O_minus">O-</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading cold storage database...</div>
        ) : filteredUnits.length === 0 ? (
          <div className="p-8 text-center text-slate-500">No blood units match the current filter in this queue.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-700 uppercase">
                <tr>
                  <th className="px-6 py-4">Bag Barcode</th>
                  <th className="px-6 py-4">Group</th>
                  <th className="px-6 py-4">Component</th>
                  <th className="px-6 py-4">Storage Bay & Temp</th>
                  <th className="px-6 py-4">FEFO Expiry</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredUnits.map((unit) => (
                  <tr key={unit.unitId} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-slate-900 flex items-center gap-2">
                      <Barcode size={16} className="text-slate-400" />
                      {unit.bagBarcode}
                      {unit.lateScan && <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-sans">Late Scan</span>}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        {unit.bloodGroup.replace('_plus', '+').replace('_minus', '-')}
                      </span>
                    </td>
                    <td className="px-6 py-4">{unit.componentType} ({unit.volumeMl}ml)</td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-800 font-medium">{unit.storageLocation}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1">
                        <Thermometer size={12} /> {unit.storageTemperatureCelsius}°C ({unit.preservativeSolution})
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getExpiryBadge(unit.expiryDate)}
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(unit.expiryDate).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        unit.status === 'Certified' ? 'bg-emerald-100 text-emerald-800' :
                        unit.status === 'Quarantined' ? 'bg-amber-100 text-amber-800' :
                        unit.status === 'Stock_Reserved' ? 'bg-blue-100 text-blue-800' :
                        unit.status === 'ISSUE_UNCONFIRMED' ? 'bg-purple-100 text-purple-800' :
                        unit.status === 'Dispatched' ? 'bg-slate-100 text-slate-800' :
                        'bg-rose-100 text-rose-800'
                      }`}>
                        {unit.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {unit.status === 'ISSUE_UNCONFIRMED' && (
                        <button
                          onClick={() => {
                            setReconcilingUnit(unit);
                            setReconcileAction('restore');
                            setReconcileReason('Physical inventory check passed: unit present in chiller');
                          }}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          Reconcile Unit
                        </button>
                      )}
                      {unit.status === 'Quarantined' && (
                        <button
                          onClick={() => {
                            setCertifyingUnit(unit);
                            setCertLabGroup(unit.bloodGroup);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          Certify TTI
                        </button>
                      )}
                      {unit.status === 'Dispatched' && (
                        <button
                          onClick={() => setReturningUnit(unit)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                        >
                          Process Return
                        </button>
                      )}
                      {unit.status === 'Certified' && (
                        <span className="text-xs text-slate-400">Ready on Shelf</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Intake Modal */}
      {showIntakeModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">Receive Blood Bag into Quarantine</h3>
            <p className="text-xs text-slate-500">Unit will be placed into Quarantined status awaiting mandatory DGHS serological testing.</p>

            <form onSubmit={handleIntakeSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Physical Bag Barcode</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. BAG-SRM-9842"
                  value={intakeBarcode}
                  onChange={(e) => setIntakeBarcode(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Initial Blood Group</label>
                  <select
                    value={intakeGroup}
                    onChange={(e) => setIntakeGroup(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="A_plus">A+</option>
                    <option value="A_minus">A-</option>
                    <option value="B_plus">B+</option>
                    <option value="B_minus">B-</option>
                    <option value="AB_plus">AB+</option>
                    <option value="AB_minus">AB-</option>
                    <option value="O_plus">O+</option>
                    <option value="O_minus">O-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Component</label>
                  <select
                    value={intakeComponent}
                    onChange={(e) => setIntakeComponent(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="WholeBlood">Whole Blood</option>
                    <option value="Platelets">Platelets</option>
                    <option value="Plasma">Fresh Frozen Plasma</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Preservative</label>
                  <select
                    value={intakePreservative}
                    onChange={(e) => setIntakePreservative(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="CPDA-1">CPDA-1 (35d)</option>
                    <option value="SAGM">SAGM (42d)</option>
                    <option value="None">None (Platelets)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Storage Bay</label>
                  <input
                    type="text"
                    required
                    value={intakeLocation}
                    onChange={(e) => setIntakeLocation(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Volume (ml)</label>
                  <input
                    type="number"
                    value={intakeVolume}
                    onChange={(e) => setIntakeVolume(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Temp (°C)</label>
                  <input
                    type="number"
                    value={intakeTemp}
                    onChange={(e) => setIntakeTemp(Number(e.target.value))}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowIntakeModal(false)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium"
                >
                  Confirm Intake
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certify Modal */}
      {certifyingUnit && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="text-emerald-600" size={20} />
              Statutory TTI & ABO Certification Gate
            </h3>
            <p className="text-xs text-slate-500">
              Mandatory serological screening under DGHS/NACO. Enforces Maker-Checker: your UID must differ from the intake officer.
            </p>

            <form onSubmit={handleCertifySubmit} className="space-y-4">
              <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1">
                <div><strong>Barcode:</strong> {certifyingUnit.bagBarcode}</div>
                <div><strong>Intake Entered By:</strong> {certifyingUnit.enteredBy || 'System'}</div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Lab-Confirmed ABO Group</label>
                  <select
                    value={certLabGroup}
                    onChange={(e) => setCertLabGroup(e.target.value)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="A_plus">A+</option>
                    <option value="A_minus">A-</option>
                    <option value="B_plus">B+</option>
                    <option value="B_minus">B-</option>
                    <option value="AB_plus">AB+</option>
                    <option value="AB_minus">AB-</option>
                    <option value="O_plus">O+</option>
                    <option value="O_minus">O-</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Rh(D) Typing</label>
                  <select
                    value={certRh}
                    onChange={(e) => setCertRh(e.target.value as any)}
                    className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="Positive">Rh Positive (D+)</option>
                    <option value="Negative">Rh Negative (D-)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-800">Mandatory 5 TTI Test Kit Lot Numbers:</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input type="text" placeholder="HIV Kit Lot" value={ttiHiv} onChange={(e) => setTtiHiv(e.target.value)} className="p-2 border rounded" required />
                  <input type="text" placeholder="HBV Kit Lot" value={ttiHbv} onChange={(e) => setTtiHbv(e.target.value)} className="p-2 border rounded" required />
                  <input type="text" placeholder="HCV Kit Lot" value={ttiHcv} onChange={(e) => setTtiHcv(e.target.value)} className="p-2 border rounded" required />
                  <input type="text" placeholder="Malaria Kit Lot" value={ttiMalaria} onChange={(e) => setTtiMalaria(e.target.value)} className="p-2 border rounded" required />
                  <input type="text" placeholder="Syphilis Lot" value={ttiSyphilis} onChange={(e) => setTtiSyphilis(e.target.value)} className="p-2 border rounded col-span-2" required />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setCertifyingUnit(null)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium"
                >
                  Certify & Issue to Shelf
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Return Modal */}
      {returningUnit && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <RotateCcw className="text-blue-600" size={20} />
              Process Blood Unit Return
            </h3>
            <p className="text-xs text-slate-500">
              DGHS 30-Minute Return Rule: Unopened units returned under 30 minutes with intact cold chain can re-enter certified inventory.
            </p>

            <form onSubmit={handleReturnSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Measured Return Temperature (°C)</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={returnTemp}
                  onChange={(e) => setReturnTemp(Number(e.target.value))}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="coldChain"
                  checked={coldChainIntact}
                  onChange={(e) => setColdChainIntact(e.target.checked)}
                  className="rounded text-blue-600"
                />
                <label htmlFor="coldChain" className="text-xs text-slate-700">
                  Officer attestation: Physical cold chain box remained intact and seal unbreached
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setReturningUnit(null)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
                >
                  Submit Return Check
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      {reconcilingUnit && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="text-purple-600" size={20} />
              Reconcile Ghost Inventory ({reconcilingUnit.bagBarcode})
            </h3>
            <p className="text-xs text-slate-500">
              This unit timed out after 10 minutes reserved without a dispatch scan. Perform a physical shelf inspection to verify location and cold chain before restoring or discarding.
            </p>

            <form onSubmit={handleReconcileSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700">Physical Inspection Outcome</label>
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setReconcileAction('restore');
                      setReconcileReason('Physical check verified unit remains intact in chiller');
                    }}
                    className={`p-3 text-xs font-semibold rounded-lg border text-left ${
                      reconcileAction === 'restore'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">Restore to Shelf</div>
                    <div className="text-[11px] font-normal text-slate-500">Unit found intact in bay. Put back on active FEFO shelf.</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReconcileAction('discard');
                      setReconcileReason('Bag missing or cold chain compromised');
                    }}
                    className={`p-3 text-xs font-semibold rounded-lg border text-left ${
                      reconcileAction === 'discard'
                        ? 'border-rose-500 bg-rose-50 text-rose-900'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-rose-700">Discard Unit</div>
                    <div className="text-[11px] font-normal text-slate-500">Unit missing or spoiled. Mark Discarded permanently.</div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Officer Attestation / Reason</label>
                <textarea
                  required
                  rows={2}
                  value={reconcileReason}
                  onChange={(e) => setReconcileReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 border rounded-lg text-xs"
                  placeholder="State physical location, condition, and verification steps taken..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setReconcilingUnit(null)}
                  className="px-4 py-2 border rounded-lg text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${
                    reconcileAction === 'restore' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {reconcileAction === 'restore' ? 'Restore to FEFO Shelf' : 'Permanently Discard'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
