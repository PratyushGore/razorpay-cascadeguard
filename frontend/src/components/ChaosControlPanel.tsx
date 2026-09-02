import React, { useState } from 'react';
import { AlertOctagon, RefreshCw, BarChart2, ShieldAlert, CheckCircle, WifiOff, X, Zap, Loader2, AlertTriangle } from 'lucide-react';
import { Jurisdiction } from '../types/compliance';
import { apiService } from '../services/api';

interface ChaosControlPanelProps {
  isOutageSimulated: boolean;
  onToggleOutage: () => void;
  onTriggerNonCompliantRetrySpam: () => void;
  activeJurisdiction: Jurisdiction;
  onBenchmarkCompleted: () => void; // Trigger page re-fetch if needed
}

export const ChaosControlPanel: React.FC<ChaosControlPanelProps> = ({
  isOutageSimulated,
  onToggleOutage,
  onTriggerNonCompliantRetrySpam,
  activeJurisdiction,
  onBenchmarkCompleted,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<{
    total: number;
    passedClean: number;
    overridden: number;
    halted: number;
    recoverySuccess: number;
    recoveryFail: number;
    details: { txId: string; amount: number; rail: string; code: string; decision: 'CLEAN' | 'OVERRIDDEN' | 'HALTED'; success: boolean }[];
  } | null>(null);

  const startBenchmark = async () => {
    setIsRunning(true);
    setProgress(0);
    setResults(null);
    try {
      const res = await apiService.runBenchmark(activeJurisdiction, (pct) => {
        setProgress(pct);
      });
      setResults(res);
      onBenchmarkCompleted();
    } catch (e) {
      console.error(e);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <div className="bg-[#131B2E] border border-slate-700/60 rounded-md p-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Label and Info */}
          <div>
            <h3 className="text-base font-semibold tracking-wider text-slate-100 flex items-center gap-1.5 uppercase font-mono">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              Chaos Simulation & Benchmark Engine
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Inject simulated webhook failures or execute automated benchmark suites to verify regulatory gateway limits.
            </p>
          </div>

          {/* Controller Buttons */}
          <div className="flex flex-wrap gap-3">
            {/* 1. Simulate Outage */}
            <button
              onClick={onToggleOutage}
              className={`flex items-center gap-2 h-11 px-5 text-sm font-semibold rounded-lg shadow-sm border transition-colors ${
                isOutageSimulated
                  ? 'bg-rose-950/40 border-rose-700/60 text-rose-455 hover:bg-rose-950/60'
                  : 'bg-slate-900 border border-slate-700 text-slate-350 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <AlertOctagon className="w-4 h-4" />
              {isOutageSimulated ? 'RE-ESTABLISH BANK SWITCHES' : 'SIMULATE BANK SWITCH OUTAGE'}
            </button>

            {/* 2. Trigger Spam */}
            <button
              onClick={onTriggerNonCompliantRetrySpam}
              className="flex items-center gap-2 h-11 px-5 text-sm font-semibold rounded-lg shadow-sm border border-amber-700/60 bg-amber-950/40 text-amber-400 hover:bg-amber-950/60 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              INJECT NON-COMPLIANT Webhook
            </button>

            {/* 3. Run Benchmark */}
            <button
              onClick={() => {
                setShowModal(true);
                startBenchmark();
              }}
              className="flex items-center gap-2 h-11 px-5 text-sm font-semibold rounded-lg shadow-sm border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
            >
              <BarChart2 className="w-4 h-4" />
              RUN 50x BENCHMARK
            </button>
          </div>
        </div>
      </div>

      {/* Benchmark Results Dialog Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-[#0B0F17] border border-slate-800/80 rounded-md w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden shadow-2xl relative">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 bg-[#131B2E] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-indigo-400" />
                <div>
                  <h3 className="text-sm font-bold text-slate-100 font-mono">
                    Synthetic 50x Benchmark Suite
                  </h3>
                  <p className="text-[10px] text-slate-500">
                    Testing guardrails against {activeJurisdiction === 'IN_RBI' ? 'India RBI Directives' : activeJurisdiction === 'US_NACHA' ? 'US NACHA Rules' : 'EU PSD3 Standards'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                disabled={isRunning}
                className="text-slate-400 hover:text-slate-200 disabled:opacity-30 p-1 rounded border border-slate-800 hover:border-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#0B0F17]">
              {/* Progress Indicator */}
              {isRunning && (
                <div className="space-y-3 text-center py-10">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mx-auto" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 font-mono">Executing Synthetic Webhooks...</h4>
                    <p className="text-[10px] text-slate-500">Evaluating Gemini recovery actions against gatekeeper directives</p>
                  </div>
                  <div className="max-w-xs mx-auto space-y-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                      <span>Progress:</span>
                      <span>{progress}%</span>
                    </div>
                    <div className="w-full h-1 bg-[#131B2E] rounded-sm overflow-hidden border border-slate-850">
                      <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Benchmark Results */}
              {results && (
                <div className="space-y-5">
                  {/* Summary Metric Strip */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className="bg-[#131B2E] border border-slate-800/80 rounded p-2.5 text-center">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Total Webhooks</span>
                      <span className="text-lg font-bold font-mono text-slate-250 tabular-nums">{results.total}</span>
                    </div>
                    <div className="bg-[#131B2E] border border-slate-800/80 rounded p-2.5 text-center">
                      <span className="text-[9px] text-emerald-500 uppercase tracking-wider block mb-1">Passed Clean</span>
                      <span className="text-lg font-bold font-mono text-emerald-400 tabular-nums">{results.passedClean}</span>
                    </div>
                    <div className="bg-[#131B2E] border border-slate-800/80 rounded p-2.5 text-center">
                      <span className="text-[9px] text-amber-500 uppercase tracking-wider block mb-1">Overridden</span>
                      <span className="text-lg font-bold font-mono text-amber-400 tabular-nums">{results.overridden}</span>
                    </div>
                    <div className="bg-[#131B2E] border border-slate-800/80 rounded p-2.5 text-center">
                      <span className="text-[9px] text-rose-500 uppercase tracking-wider block mb-1">Halted</span>
                      <span className="text-lg font-bold font-mono text-rose-450 tabular-nums">{results.halted}</span>
                    </div>
                    <div className="bg-[#131B2E] border border-slate-800/80 rounded p-2.5 text-center col-span-2 md:col-span-1">
                      <span className="text-[9px] text-sky-500 uppercase tracking-wider block mb-1">Recovery Rate</span>
                      <span className="text-lg font-bold font-mono text-sky-400 tabular-nums">
                        {((results.recoverySuccess / (results.total - results.halted)) * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Tally Bars */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block">Decision Distribution</span>
                    <div className="w-full h-2 bg-[#131B2E] border border-slate-800 rounded-sm overflow-hidden flex">
                      <div className="h-full bg-emerald-500" style={{ width: `${(results.passedClean / results.total) * 100}%` }} title="Passed Clean" />
                      <div className="h-full bg-amber-500" style={{ width: `${(results.overridden / results.total) * 100}%` }} title="Overridden" />
                      <div className="h-full bg-rose-500" style={{ width: `${(results.halted / results.total) * 100}%` }} title="Halted" />
                    </div>
                    <div className="flex gap-4 text-[9px] text-slate-500 justify-center">
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> Clean Pass ({results.passedClean})</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-amber-500 rounded-full"></span> Override ({results.overridden})</span>
                      <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span> Halted ({results.halted})</span>
                    </div>
                  </div>

                  {/* Details Scrollable Log */}
                  <div className="space-y-1.5">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider font-semibold block">Detailed Test Log</span>
                    <div className="border border-slate-800 bg-[#131B2E] rounded overflow-hidden max-h-[300px] overflow-y-auto">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-[#131B2E] text-slate-400 text-[9px] uppercase font-bold sticky top-0 border-b border-slate-800 z-10">
                          <tr>
                            <th className="py-2 px-3">TxID</th>
                            <th className="py-2 px-3">Amount</th>
                            <th className="py-2 px-3">Rail</th>
                            <th className="py-2 px-3">Error</th>
                            <th className="py-2 px-3">Compliance</th>
                            <th className="py-2 px-3 text-right">Recovery</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-850 bg-[#0B0F17] font-mono text-[11px]">
                          {results.details.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-800/10">
                              <td className="py-1.5 px-3 font-bold text-slate-350">{item.txId}</td>
                              <td className="py-1.5 px-3 text-slate-400 tabular-nums">
                                {activeJurisdiction === 'IN_RBI' ? '₹' : activeJurisdiction === 'EU_PSD3' ? '€' : '$'}
                                {item.amount.toLocaleString()}
                              </td>
                              <td className="py-1.5 px-3">
                                <span className="px-1 py-0.2 rounded bg-slate-900 text-[9px] border border-slate-800 font-sans font-semibold text-slate-450">
                                  {item.rail}
                                </span>
                              </td>
                              <td className="py-1.5 px-3 text-[10px] text-slate-500">{item.code}</td>
                              <td className="py-1.5 px-3">
                                {item.decision === 'CLEAN' ? (
                                  <span className="text-emerald-450 flex items-center gap-1 font-sans font-semibold text-[10px]">CLEAN PASS</span>
                                ) : item.decision === 'OVERRIDDEN' ? (
                                  <span className="text-amber-450 flex items-center gap-1 font-sans font-semibold text-[10px]">OVERRIDDEN</span>
                                ) : (
                                  <span className="text-rose-455 flex items-center gap-1 font-sans font-semibold text-[10px]">HALTED</span>
                                )}
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                {item.decision === 'HALTED' ? (
                                  <span className="text-slate-600 font-sans font-semibold text-[10px]">BLOCKED</span>
                                ) : item.success ? (
                                  <span className="text-emerald-500 font-sans font-bold text-[10px]">SUCCESS</span>
                                ) : (
                                  <span className="text-rose-500 font-sans font-bold text-[10px]">FAIL</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-[#131B2E] border-t border-slate-800 flex justify-between items-center">
              <span className="text-[9px] text-slate-500 font-mono">Suite: Sentinel_V2.5-Stable</span>
              <div className="flex gap-2">
                <button
                  onClick={startBenchmark}
                  disabled={isRunning}
                  className="h-8 px-3 text-xs font-semibold rounded border border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-30"
                >
                  RE-RUN SUITE
                </button>
                <button
                  onClick={() => setShowModal(false)}
                  disabled={isRunning}
                  className="h-8 px-3 text-xs font-semibold rounded border border-slate-750 bg-slate-900 text-slate-350 hover:bg-slate-850 hover:text-white transition-colors"
                >
                  DISMISS
                </button>
              </div>
            </div>

          </div>
        </div>
      )}
    </>
  );
};
