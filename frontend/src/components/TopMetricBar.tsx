import React from 'react';
import { Activity, TrendingUp, Coins, Scale, AlertOctagon, ShieldCheck, ShieldAlert } from 'lucide-react';
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
        return 'RBI Master Direction v2';
      case 'US_NACHA':
        return 'NACHA Core Guidelines';
      case 'EU_PSD3':
        return 'PSD3 Regulatory Framework';
    }
  };

  const getJurisdictionFlag = (jur: Jurisdiction) => {
    switch (jur) {
      case 'IN_RBI':
        return '🇮🇳';
      case 'US_NACHA':
        return '🇺🇸';
      case 'EU_PSD3':
        return '🇪🇺';
    }
  };

  const getJurisdictionDesc = (jur: Jurisdiction) => {
    switch (jur) {
      case 'IN_RBI':
        return 'E-Mandate limits & 24h cooling enforced';
      case 'US_NACHA':
        return 'Max 3 NSF attempts & Auth checks active';
      case 'EU_PSD3':
        return 'Biometric SCA & €500 caps enforced';
    }
  };

  return (
    <div className="mb-6 space-y-3">
      {/* Slim Sentinel & Policy Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-[#0B1426] border border-[#1B2C4B] rounded-lg shadow-sm">
        {/* Left: Sentinel Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sentinel Engine:
            </span>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-bold font-mono rounded-full border ${
                isOutageSimulated
                  ? 'bg-rose-950/60 border-rose-600/70 text-rose-400'
                  : 'bg-emerald-950/60 border-emerald-600/70 text-emerald-400'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isOutageSimulated ? 'bg-rose-400 animate-ping' : 'bg-emerald-400'
                }`}
              />
              {isOutageSimulated ? 'CHAOS_OUTAGE_ACTIVE' : 'SENTINEL_ARMED_SECURE'}
            </span>
          </div>
          <span className="text-slate-600 hidden sm:inline">|</span>
          <span className="text-[11px] font-mono text-slate-400 hidden sm:flex items-center gap-1">
            {isOutageSimulated ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>Simulated Switch Failure: Secondary Failover Active</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Deterministic Gatekeeper: Real-Time Evaluator Online</span>
              </>
            )}
          </span>
        </div>

        {/* Right: Active Policy Jurisdiction */}
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Active Directive:
          </span>
          <div className="flex items-center gap-1.5 px-2.5 py-0.5 bg-[#070C18] border border-[#1B2C4B] rounded">
            <span className="text-sm">{getJurisdictionFlag(jurisdiction)}</span>
            <Scale className="w-3.5 h-3.5 text-[#0D94FB]" />
            <span className="text-xs font-bold text-white font-mono">
              {getJurisdictionLabel(jurisdiction)}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 hidden md:inline font-mono">
            ({getJurisdictionDesc(jurisdiction)})
          </span>
        </div>
      </div>

      {/* 4 Consolidated Core Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Ingested Failures */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] hover:border-[#0D94FB]/40 transition-colors rounded-lg p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
              Ingested Failures
            </span>
            <span className="text-2xl lg:text-3xl font-black tracking-tight text-white font-mono tabular-nums block">
              {totalFailures}
            </span>
            <span className="text-[11px] text-slate-400 block font-mono">
              Live webhook stream
            </span>
          </div>
          <div className="p-2 rounded-lg border bg-rose-950/40 border-rose-700/60 text-rose-400 self-start">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2: Recovered Revenue */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] hover:border-emerald-500/40 transition-colors rounded-lg p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
              Recovered Revenue
            </span>
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl lg:text-3xl font-black tracking-tight text-emerald-400 font-mono tabular-nums">
                ₹{recoveredVolumeINR.toLocaleString('en-IN')}
              </span>
              <span className="text-xs font-semibold text-emerald-500/90 font-mono">
                / ${recoveredVolumeUSD.toLocaleString('en-US')}
              </span>
            </div>
            <span className="text-[11px] text-slate-400 block font-mono">
              Multi-currency recovered
            </span>
          </div>
          <div className="p-2 rounded-lg border bg-emerald-950/40 border-emerald-700/60 text-emerald-400 self-start">
            <Coins className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3: Recovery Rate */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] hover:border-[#0D94FB]/40 transition-colors rounded-lg p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
              Recovery Success Rate
            </span>
            <span className="text-2xl lg:text-3xl font-black tracking-tight text-[#0D94FB] font-mono tabular-nums block">
              {recoveryRate.toFixed(1)}%
            </span>
            <span className="text-[11px] text-slate-400 block font-mono">
              AI hypothesis resolution
            </span>
          </div>
          <div className="p-2 rounded-lg border bg-[#012652] border-[#0D94FB]/50 text-[#0D94FB] self-start">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4: Policy Overrides */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] hover:border-amber-500/40 transition-colors rounded-lg p-4 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-400 block">
              Statutory Overrides
            </span>
            <span className="text-2xl lg:text-3xl font-black tracking-tight text-amber-400 font-mono tabular-nums block">
              {totalOverrides}
            </span>
            <span className="text-[11px] text-slate-400 block font-mono">
              Deterministic law enforced
            </span>
          </div>
          <div className="p-2 rounded-lg border bg-amber-950/40 border-amber-700/60 text-amber-400 self-start">
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
};
