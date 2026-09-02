import React from 'react';
import { Shield, Activity, TrendingUp, Coins, Scale, AlertOctagon } from 'lucide-react';
import { Jurisdiction } from '../types/compliance';

interface TopMetricBarProps {
  totalFailures: number;
  recoveredVolumeINR: number;
  recoveredVolumeUSD: number;
  recoveryRate: number;
  jurisdiction: Jurisdiction;
  totalOverrides: number;
  isOutageSimulated: boolean;
}

export const TopMetricBar: React.FC<TopMetricBarProps> = ({
  totalFailures,
  recoveredVolumeINR,
  recoveredVolumeUSD,
  recoveryRate,
  jurisdiction,
  totalOverrides,
  isOutageSimulated,
}) => {
  const getJurisdictionLabel = (jur: Jurisdiction) => {
    switch (jur) {
      case 'IN_RBI':
        return '🇮🇳 RBI Master Direction v2';
      case 'US_NACHA':
        return '🇺🇸 NACHA Core Guidelines';
      case 'EU_PSD3':
        return '🇪🇺 PSD3 Regulatory Framework';
    }
  };

  const getJurisdictionDesc = (jur: Jurisdiction) => {
    switch (jur) {
      case 'IN_RBI':
        return 'E-Mandate limits & 24h cooling checks active';
      case 'US_NACHA':
        return 'Max 3 NSF attempts & Auth checks active';
      case 'EU_PSD3':
        return 'Biometric SCA & €500 caps enforced';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4 mb-6">
      {/* 1. Sentinel Status */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Sentinel Status</span>
          <div className="flex items-center gap-1.5 my-1">
            <span className={`px-3 py-1 text-xs font-semibold rounded-full border ${isOutageSimulated ? 'bg-rose-950/50 border-rose-700/60 text-rose-400' : 'bg-emerald-950/50 border-emerald-700/60 text-emerald-400'}`}>
              {isOutageSimulated ? 'CHAOS_ACTIVE' : 'ACTIVE_SECURE'}
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-1 block">Gatekeeper: ONLINE</span>
        </div>
        <div className={`p-1.5 rounded border ${isOutageSimulated ? 'bg-rose-950/40 border-rose-700/60 text-rose-400' : 'bg-emerald-950/40 border-emerald-700/60 text-emerald-400'}`}>
          <Shield className="w-4 h-4" />
        </div>
      </div>

      {/* 2. Total Ingested Failures */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Ingested Failures</span>
          <span className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {totalFailures}
          </span>
          <span className="text-xs text-slate-400 mt-0.5 block">Live webhook streaming</span>
        </div>
        <div className="p-1.5 rounded border bg-rose-950/40 border-rose-700/60 text-rose-400">
          <Activity className="w-4 h-4" />
        </div>
      </div>

      {/* 3. Total Recovered Volume */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between lg:col-span-2">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Recovered Revenue</span>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
              ₹{recoveredVolumeINR.toLocaleString('en-IN')}
            </span>
            <span className="text-sm font-medium text-emerald-400 font-mono">
              / ${recoveredVolumeUSD.toLocaleString('en-US')}
            </span>
          </div>
          <span className="text-xs text-slate-400 mt-0.5 block">Multi-currency dispatch</span>
        </div>
        <div className="p-1.5 rounded border bg-emerald-950/40 border-emerald-700/60 text-emerald-400">
          <Coins className="w-4 h-4" />
        </div>
      </div>

      {/* 4. Recovery Rate % */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Recovery Rate</span>
          <span className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {recoveryRate.toFixed(1)}%
          </span>
          <span className="text-xs text-slate-400 mt-0.5 block">AI recovery success</span>
        </div>
        <div className="p-1.5 rounded border bg-sky-950/40 border-sky-700/60 text-sky-400">
          <TrendingUp className="w-4 h-4" />
        </div>
      </div>

      {/* 5. Policy Jurisdiction Badge */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Active Policy</span>
          <span className="text-sm font-bold tracking-tight text-slate-100 block leading-tight">
            {getJurisdictionLabel(jurisdiction)}
          </span>
          <span className="text-xs text-slate-400 mt-0.5 block leading-tight">
            {getJurisdictionDesc(jurisdiction)}
          </span>
        </div>
        <div className="p-1.5 rounded border bg-slate-900 border-slate-700/60 text-slate-400">
          <Scale className="w-4 h-4" />
        </div>
      </div>

      {/* 6. Total Overrides count */}
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-3.5 flex items-center justify-between">
        <div>
          <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Rule Overrides</span>
          <span className="text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {totalOverrides}
          </span>
          <span className="text-xs text-slate-400 mt-0.5 block">Deterministic routing</span>
        </div>
        <div className="p-1.5 rounded border bg-amber-950/40 border-amber-700/60 text-amber-400">
          <AlertOctagon className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
