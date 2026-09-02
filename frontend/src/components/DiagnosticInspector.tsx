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
      <div className="bg-[#131B2E] border border-slate-800/80 rounded-md flex flex-col items-center justify-center text-center p-8 h-[calc(100vh-170px)]">
        <div className="p-3 bg-slate-900 border border-slate-800 text-indigo-400 rounded-md mb-3">
          <Brain className="w-5 h-5" />
        </div>
        <h3 className="text-sm font-bold text-slate-200 mb-1.5 font-mono">No Transaction Selected</h3>
        <p className="text-xs text-slate-500 max-w-xs leading-normal">
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
    <div className="bg-[#131B2E] border border-slate-700/60 rounded-md flex flex-col h-[calc(100vh-170px)] overflow-hidden">
      {/* Title Header */}
      <div className="p-4 border-b border-slate-700 bg-[#131B2E] flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-100 flex items-center gap-1.5">
            <Brain className="w-4 h-4 text-indigo-400" />
            Diagnostic Inspector
          </h2>
          <p className="text-xs tracking-wide uppercase font-semibold text-slate-400 mt-1">AI reasoning & switch telemetry correlation</p>
        </div>
        <span className="font-mono text-sm font-semibold px-2.5 py-1 bg-[#0B0F17] border border-slate-700/60 rounded text-slate-350">
          {transaction.id}
        </span>
      </div>

      {/* Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#0B0F17]">
        {/* Core Transaction Metadata */}
        <div className="bg-[#131B2E] border border-slate-700/60 rounded p-3.5">
          <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold block mb-2">Ingested Failure Details</span>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-400 block mb-0.5 text-xs">Customer</span>
              <span className="font-bold text-slate-150 block">{transaction.customerName}</span>
              <span className="text-xs text-slate-450 block font-mono mt-0.5">{transaction.customerId}</span>
            </div>
            <div className="text-right">
              <span className="text-xs uppercase tracking-wide font-semibold text-slate-400 block mb-1">Failed Value</span>
              <span className="text-2xl font-black text-rose-400 font-mono tracking-tight tabular-nums">
                {transaction.currency === 'INR' ? '₹' : transaction.currency === 'EUR' ? '€' : '$'}
                {transaction.amount.toLocaleString()}
              </span>
            </div>
            <div className="col-span-2 pt-2.5 border-t border-slate-700/60">
              <span className="text-slate-400 text-xs uppercase font-semibold block mb-1">Switch Error Code</span>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-rose-950/40 text-rose-455 border border-rose-700/60 rounded font-mono text-xs font-semibold">
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
        <div className="bg-[#131B2E] border border-slate-700/60 rounded p-3.5 space-y-3">
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
              <div className="w-full h-2.5 bg-[#0B0F17] rounded-sm overflow-hidden border border-slate-700/60">
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
            <div className="col-span-3 pt-1 flex items-center justify-between text-sm font-semibold border-t border-slate-700/60">
              <div className="flex items-center gap-1.5 text-slate-300">
                <Clock className="w-3.5 h-3.5 text-slate-455" />
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

        {/* AI Reasoning Card */}
        <div className="rounded border border-sky-750/70 bg-sky-950/40 p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-sky-900/30 pb-1.5">
            <span className="text-xs text-sky-400 font-bold uppercase tracking-wider flex items-center gap-1">
              <Brain className="w-3.5 h-3.5 text-sky-400" />
              AI Diagnosis (Gemini)
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-sky-400">Confidence:</span>
              <span className="text-sm font-mono font-bold text-sky-400">
                {confidence}%
              </span>
            </div>
          </div>

          <div className="space-y-2.5 text-sm">
            <div>
              <span className="text-sky-400 text-xs font-semibold block mb-1">Root Cause Hypothesis:</span>
              <p className="text-slate-200 italic bg-[#0B0F17]/50 p-2.5 rounded border border-slate-700/60 leading-relaxed text-sm">
                "{transaction.aiDiagnosis.rootCause}"
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-0.5">
              <div>
                <span className="text-sky-400 text-xs font-semibold block mb-1">Proposed Action:</span>
                <div className="flex items-start gap-1 text-slate-250">
                  <CornerDownRight className="w-3.5 h-3.5 text-sky-400 shrink-0 mt-0.5" />
                  <span className="font-semibold text-sm leading-relaxed text-slate-200">
                    {transaction.aiDiagnosis.proposedAction}
                  </span>
                </div>
              </div>
              <div>
                <span className="text-sky-400 text-xs font-semibold block mb-1">Recommended Backoff:</span>
                <span className="text-slate-200 font-semibold block text-sm leading-relaxed">
                  {transaction.aiDiagnosis.suggestedDelayMinutes > 0
                    ? `${transaction.aiDiagnosis.suggestedDelayMinutes} minutes`
                    : 'Immediate dispatch'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Dynamic Success Probability Dial */}
        <div className="bg-[#131B2E] border border-slate-700/60 rounded p-3.5 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-slate-455" />
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
                  stroke="rgba(255,255,255,0.03)"
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
      <div className="p-3.5 bg-[#131B2E] border-t border-slate-700/60 flex justify-between items-center">
        <div className="text-xs text-slate-400 font-mono">
          <span>Retries: {transaction.retryCount} / {transaction.maxRetriesAllowed}</span>
        </div>

        <button
          onClick={() => onTriggerRetry(transaction.id)}
          disabled={transaction.status === 'RECOVERING' || transaction.status === 'RECOVERED' || transaction.status === 'FAILED_PERMANENTLY'}
          className={`flex items-center gap-1.5 h-10 px-4 text-sm font-semibold rounded-md shadow-sm border transition-colors ${
            transaction.status === 'RECOVERING'
              ? 'bg-sky-950/40 text-sky-400 border border-sky-700/60 cursor-wait'
              : transaction.status === 'RECOVERED'
              ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-700/60 cursor-not-allowed'
              : transaction.status === 'FAILED_PERMANENTLY'
              ? 'bg-slate-950 text-slate-500 border border-slate-900/60 cursor-not-allowed'
              : 'bg-indigo-600 text-white border border-indigo-700 hover:bg-indigo-750 active:scale-98'
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
