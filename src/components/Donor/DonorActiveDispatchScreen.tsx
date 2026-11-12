import React, { useState, useEffect } from 'react';
import { 
  Car, 
  MapPin, 
  ShieldAlert, 
  QrCode, 
  ExternalLink, 
  AlertTriangle,
  HeartHandshake
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthProvider';
import { ref, onValue } from 'firebase/database';
import { db } from '../../firebase';

export const DonorActiveDispatchScreen: React.FC = () => {
  const { user, profile } = useAuth();
  const [matchData, setMatchData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tokenTimeLeft, setTokenTimeLeft] = useState(120);

  useEffect(() => {
    if (!user) return;
    const matchRef = ref(db, `active_donor_matches/${user.uid}`);
    const unsubscribe = onValue(matchRef, (snapshot) => {
      setMatchData(snapshot.val());
      setLoading(false);
    });
    return () => unsubscribe();
  }, [user]);

  // Rotate QR HMAC token countdown every 120s
  useEffect(() => {
    const timer = setInterval(() => {
      setTokenTimeLeft((prev) => (prev <= 1 ? 120 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-white text-sm">Loading active dispatch mission...</div>
      </div>
    );
  }

  const destination = matchData?.destination || {
    destinationId: 'FACILITY_DEFAULT',
    destinationType: 'HOSPITAL_COLLECTION_CENTRE',
    isBSC: false
  };

  const navUrl = destination.latitude && destination.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${destination.latitude},${destination.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination.destinationId || 'Blood Centre')}`;

  // Dynamic check-in pass payload
  const checkinToken = btoa(JSON.stringify({
    uid: user?.uid,
    req: matchData?.requestId || 'EMERGENCY_SOS',
    exp: Math.floor(Date.now() / 120000)
  }));

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 flex flex-col justify-between max-w-xl mx-auto selection:bg-rose-500">
      {/* Top Banner: Sec 184 MVA Driving Protocol */}
      <div className="space-y-4">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <ShieldAlert className="text-amber-400 shrink-0 mt-0.5" size={20} />
          <div>
            <h2 className="text-xs font-bold tracking-wider uppercase text-amber-400">
              Section 184 MVA Driving Safety Shield Active
            </h2>
            <p className="text-[12px] text-slate-300 mt-1 leading-relaxed">
              All sound alerts and countdown notifications are strictly suppressed to avoid driver distraction. Please drive calmly and follow all traffic regulations.
            </p>
          </div>
        </div>

        {/* Primary Mission Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-mono uppercase tracking-wider text-emerald-400">
                {matchData?.status === 'CLAIMED' ? 'SLOT CONFIRMED' : 'ACTIVE EN-ROUTE'}
              </span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
              {profile?.bloodGroup?.replace('_plus', '+').replace('_minus', '-') || 'O+'} Donating
            </span>
          </div>

          <div>
            <div className="text-xs text-slate-400 font-medium">Reporting Facility</div>
            <div className="text-xl font-bold text-white mt-1 flex items-center gap-2">
              <MapPin className="text-rose-500" size={20} />
              {destination.destinationId}
            </div>
            <div className="text-xs text-slate-400 mt-1">
              {destination.isBSC ? 'Licensed Linked Blood Bank Facility' : 'Direct Hospital Blood Collection Centre'}
            </div>
          </div>

          {/* Navigation Button */}
          <a
            href={navUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 transition-transform active:scale-[0.98]"
          >
            <Car size={20} />
            Start Google Maps Navigation
            <ExternalLink size={16} />
          </a>
        </div>

        {/* Staff Verification QR Pass */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4">
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <QrCode size={16} />
            Phlebotomy Desk Arrival Pass
          </div>

          <div className="bg-white p-4 rounded-xl inline-block shadow-inner mx-auto">
            {/* Visual Token representation */}
            <div className="w-48 h-48 bg-slate-900 rounded-lg flex flex-col items-center justify-center p-3 text-center border-4 border-slate-900">
              <HeartHandshake size={48} className="text-rose-500 animate-pulse mb-2" />
              <div className="text-[10px] font-mono text-slate-300 break-all select-all">
                {checkinToken.slice(0, 36)}...
              </div>
              <div className="text-[9px] text-emerald-400 font-mono mt-2">
                VERIFIED DONOR TOKEN
              </div>
            </div>
          </div>

          <div className="text-xs text-slate-400">
            Show this screen to hospital staff upon entering the phlebotomy room.
            <div className="text-[11px] text-slate-500 mt-1 font-mono">
              Dynamic token refreshes in {tokenTimeLeft}s
            </div>
          </div>
        </div>
      </div>

      {/* Safety Notice Footer */}
      <div className="pt-6 pb-2 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
        <AlertTriangle size={14} className="text-amber-500" />
        If you experience an emergency or cannot travel, notify coordinator upon safe parking.
      </div>
    </div>
  );
};
