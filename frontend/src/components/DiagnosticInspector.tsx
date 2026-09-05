import React from 'react';
import { Activity, Brain, Server, Clock, ShieldAlert, Zap, CornerDownRight, BarChart3 } from 'lucide-react';
import { Transaction } from '../types/transaction';
import { Jurisdiction } from '../types/compliance';

interface DiagnosticInspectorProps {
  transaction: Transaction | null;
  onTriggerRetry: (txId: string) => void;
  activeJurisdiction: Jurisdiction;
}

export const DiagnosticInspector: React.FC<DiagnosticInspectorProps> = ({
  transaction,
  onTriggerRetry,
  activeJurisdiction,
}) => {
  if (!transaction) {
    return (
      <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg flex flex-col items-center justify-center text-center p-8 h-[calc(100vh-170px)] shadow-sm">
        <div className="p-3 bg-[#012652] border border-[#0D94FB]/40 text-[#0D94FB] rounded-lg mb-3 shadow-sm">
          <Brain className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-slate-200 mb-1.5 font-mono">No Transaction Selected</h3>
        <p className="text-xs text-slate-400 max-w-xs leading-normal">
          Select a failed transaction webhook from the live feed to inspect its real-time telemetry, AI diagnosis, and compliance status.
        </p>
      </div>
    );
  }

  // Calculate dynamic success probability based on switch health and AI confidence
  const switchHealth = transaction.bankTelemetry.switchHealthPct;
  const confidence = transaction.aiDiagnosis.confidenceScore;
  const baseProbability = Math.round((switchHealth * 0.7) + (confidence * 0.3));
  
  // Compliance status adjustments to probability
  let recoveryProb = baseProbability;
  if (transaction.complianceResult?.status === 'HALTED') {
    recoveryProb = 0;
  } else if (transaction.complianceResult?.status === 'OVERRIDDEN') {
    recoveryProb = Math.min(100, Math.round(recoveryProb * 1.2));
  }

  const getHealthColorClass = (health: number) => {
    if (health >= 80) return 'text-emerald-400 bg-emerald-950/40 border-emerald-800/50';
    if (health >= 60) return 'text-amber-400 bg-amber-950/40 border-amber-800/50';
    return 'text-rose-400 bg-rose-950/40 border-rose-800/50';
  };

  const getHealthTextClass = (health: number) => {
    if (health >= 80) return 'text-emerald-400';
    if (health >= 60) return 'text-amber-400';
    return 'text-rose-400';
  };

  const getLatencyColor = (ms: number) => {
    if (ms < 150) return 'bg-emerald-500';
    if (ms < 500) return 'bg-amber-500';
    return 'bg-rose-500';
  };

  return (
    <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg flex flex-col h-[calc(100vh-170px)] overflow-hidden shadow-sm">
      {/* Title Header */}
      <div className="p-3.5 border-b border-[#1B2C4B] bg-[#012652]/30 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-[#0D94FB]" />
            Diagnostic Inspector
          </h2>
          <p className="text-[11px] tracking-wide uppercase font-semibold text-slate-400 mt-0.5">AI reasoning & switch telemetry correlation</p>
        </div>
        <span className="font-mono text-xs font-semibold px-2.5 py-1 bg-[#070C18] border border-[#1B2C4B] rounded text-slate-300">
          {transaction.id}
        </span>
      </div>

      {/* Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#070C18]">
        {/* Core Transaction Metadata */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg p-3.5">
          <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold block mb-2">Ingested Failure Details</span>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400 block mb-0.5 text-xs">Customer</span>
              <span className="font-bold text-slate-150 block">{transaction.customerName}</span>
              <span className="text-xs text-slate-400 block font-mono mt-0.5">{transaction.customerId}</span>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Failed Value</span>
              <span className="text-2xl font-black text-rose-400 font-mono tracking-tight tabular-nums">
                {transaction.currency === 'INR' ? '₹' : transaction.currency === 'EUR' ? '€' : '$'}
                {transaction.amount.toLocaleString()}
              </span>
            </div>
            <div className="col-span-2 pt-2.5 border-t border-[#1B2C4B]">
              <span className="text-slate-400 text-xs uppercase font-semibold block mb-1">Switch Error Code</span>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-rose-950/40 text-rose-400 border border-rose-700/60 rounded font-mono text-xs font-semibold">
                  {transaction.errorCode}
                </span>
                <span className="text-slate-300 text-xs font-medium truncate">
                  {transaction.errorMessage}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bank Switch Telemetry Gauge */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
              <Server className="w-3.5 h-3.5 text-slate-400" />
              Switch Node Telemetry
            </span>
            <span className="text-xs text-slate-300 font-semibold truncate max-w-[150px]">
              {transaction.bankTelemetry.bankName}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 items-center">
            {/* Health Meter */}
            <div className="col-span-2 space-y-1">
              <div className="flex justify-between text-sm font-semibold">
                <span className="text-slate-400">Node Switch Health:</span>
                <span className={`font-mono font-bold ${getHealthTextClass(switchHealth)}`}>
                  {switchHealth}%
                </span>
              </div>
              <div className="w-full h-2.5 bg-[#070C18] rounded-sm overflow-hidden border border-[#1B2C4B]">
                <div
                  className={`h-full transition-all duration-500 ${
                    switchHealth >= 80 ? 'bg-emerald-500' : switchHealth >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${switchHealth}%` }}
                />
              </div>
            </div>

            {/* Health Status Indicator Badge */}
            <div className="text-center">
              <span className={`inline-block w-full py-1.5 px-2.5 rounded border text-xs font-semibold uppercase tracking-wide ${getHealthColorClass(switchHealth)}`}>
                {switchHealth >= 80 ? 'HEALTHY' : switchHealth >= 60 ? 'DEGRADED' : 'DOWN'}
              </span>
            </div>

            {/* Latency meter */}
            <div className="col-span-3 pt-1 flex items-center justify-between text-sm font-semibold border-t border-[#1B2C4B]">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span>Node Latency:</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono font-bold text-slate-200 tabular-nums">
                  {transaction.bankTelemetry.latencyMs} ms
                </span>
                <div className="flex gap-0.5">
                  <div className={`w-1 h-3 rounded-sm ${transaction.bankTelemetry.latencyMs >= 1 ? getLatencyColor(transaction.bankTelemetry.latencyMs) : 'bg-slate-800'}`}></div>
                  <div className={`w-1 h-3 rounded-sm ${transaction.bankTelemetry.latencyMs >= 150 ? getLatencyColor(transaction.bankTelemetry.latencyMs) : 'bg-slate-800'}`}></div>
                  <div className={`w-1 h-3 rounded-sm ${transaction.bankTelemetry.latencyMs >= 500 ? getLatencyColor(transaction.bankTelemetry.latencyMs) : 'bg-slate-800'}`}></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Reasoning Card — Distinctly labeled as AI Proposal */}
        <div className="rounded-lg border-2 border-[#0D94FB]/50 bg-[#012652]/25 p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#0D94FB]/20 pb-2">
            <span className="text-xs text-[#0D94FB] font-bold uppercase tracking-wider flex items-center gap-1.5">
              <Brain className="w-4 h-4 text-[#0D94FB]" />
              STEP 1 — AI DIAGNOSIS (Gemini)
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Confidence:</span>
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-[#0D94FB]/20 text-[#0D94FB] border border-[#0D94FB]/30">
                {confidence}%
              </span>
            </div>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <span className="text-xs font-bold uppercase tracking-wide text-slate-400 block mb-1">Root Cause Hypothesis:</span>
              <p className="text-slate-200 italic bg-[#070C18] p-2.5 rounded border border-[#1B2C4B] leading-relaxed text-xs">
                "{transaction.aiDiagnosis.rootCause}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0D94FB]/20 text-[#0D94FB] border border-[#0D94FB]/30 inline-block mb-1.5">
                  AI PROPOSED ACTION
                </span>
                <div className="flex items-start gap-1 text-slate-200">
                  <CornerDownRight className="w-4 h-4 text-[#0D94FB] shrink-0 mt-0.5" />
                  <span className="font-bold text-sm leading-relaxed text-white">
                    {transaction.aiDiagnosis.proposedAction}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">Recommended Backoff:</span>
                <span className="text-slate-200 font-semibold block text-sm leading-relaxed font-mono">
                  {transaction.aiDiagnosis.suggestedDelayMinutes > 0
                    ? `${transaction.aiDiagnosis.suggestedDelayMinutes} minutes`
                    : 'Immediate dispatch'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Success Probability Dial */}
        <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg p-3.5 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-slate-400" />
              Recovery Probability
            </span>
            <p className="text-xs text-slate-400 leading-tight max-w-[200px]">
              Calculated combining telemetry health, AI model confidence, and policy overrides.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center">
              <svg className="w-16 h-16 transform -rotate-90">
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke="rgba(255,255,255,0.05)"
                  strokeWidth="5"
                  fill="transparent"
                />
                <circle
                  cx="32"
                  cy="32"
                  r="26"
                  stroke={recoveryProb >= 70 ? '#10B981' : recoveryProb >= 40 ? '#F59E0B' : '#EF4444'}
                  strokeWidth="5"
                  fill="transparent"
                  strokeDasharray={2 * Math.PI * 26}
                  strokeDashoffset={2 * Math.PI * 26 * (1 - recoveryProb / 100)}
                  className="transition-all duration-1000 ease-out"
                />
              </svg>
              <div className="absolute text-lg font-mono font-bold text-slate-200">
                {recoveryProb}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Actions Trigger Footer */}
      <div className="p-3.5 bg-[#012652]/30 border-t border-[#1B2C4B] flex justify-between items-center">
        <div className="text-xs text-slate-400 font-mono">
          <span>Retries: {transaction.retryCount} / {transaction.maxRetriesAllowed}</span>
        </div>

        <button
          onClick={() => onTriggerRetry(transaction.id)}
          disabled={transaction.status === 'RECOVERING' || transaction.status === 'RECOVERED' || transaction.status === 'FAILED_PERMANENTLY'}
          className={`flex items-center gap-1.5 h-9 px-4 text-xs font-bold rounded-lg shadow-sm border transition-colors ${
            transaction.status === 'RECOVERING'
              ? 'bg-[#012652] text-[#0D94FB] border border-[#0D94FB]/60 cursor-wait'
              : transaction.status === 'RECOVERED'
              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-700/60 cursor-not-allowed'
              : transaction.status === 'FAILED_PERMANENTLY'
              ? 'bg-[#070C18] text-slate-500 border border-slate-800 cursor-not-allowed'
              : 'bg-[#0D94FB] text-white border border-[#0B7FE0] hover:bg-[#0B7FE0] active:scale-98'
          }`}
        >
          <Zap className="w-3.5 h-3.5" />
          {transaction.status === 'RECOVERING'
            ? 'RETRYING...'
            : transaction.status === 'RECOVERED'
            ? 'RECOVERED'
            : transaction.status === 'FAILED_PERMANENTLY'
            ? 'BLOCKED'
            : 'TRIGGER RETRY'}
        </button>
      </div>
    </div>
  );
};
