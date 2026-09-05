import React, { useState, useEffect, useRef } from 'react';
import { ShieldAlert, RefreshCw, Cpu, Database, AlertOctagon } from 'lucide-react';
import { Transaction } from './types/transaction';
import { Jurisdiction } from './types/compliance';
import { AuditEntry } from './types/audit';
import { TopMetricBar } from './components/TopMetricBar';
import { LiveFailureFeed } from './components/LiveFailureFeed';
import { DiagnosticInspector } from './components/DiagnosticInspector';
import { ComplianceMatrix } from './components/ComplianceMatrix';
import { ChaosControlPanel } from './components/ChaosControlPanel';
import { AuditLedgerTable } from './components/AuditLedgerTable';
import { apiService } from './services/api';
import { websocketService } from './services/websocket';
import { generateAuditHistory, bankTelemetryState } from './services/mockData';

export const App: React.FC = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [activeJurisdiction, setActiveJurisdiction] = useState<Jurisdiction>('IN_RBI');
  const [isAutoStreaming, setIsAutoStreaming] = useState(true);
  const [streamSpeedMs, setStreamSpeedMs] = useState(4000);
  const [isOutageSimulated, setIsOutageSimulated] = useState(false);
  const [injectCounter, setInjectCounter] = useState(1);
  const injectCounterRef = useRef(1);
  const activeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // 1. Initial Load and Jurisdiction Sync
  const loadTransactions = async (jur: Jurisdiction) => {
    const data = await apiService.getTransactions(jur);
    setTransactions(data);
    
    // Automatically select the first transaction if none selected
    if (data.length > 0 && !selectedTxId) {
      setSelectedTxId(data[0].id);
    }
  };

  useEffect(() => {
    loadTransactions(activeJurisdiction);
  }, [activeJurisdiction]);

  // 2. Real-time Stream Orchestration with Realistic Lifecycle Simulation
  useEffect(() => {
    if (!isAutoStreaming) return;

    // Establish WebSocket listener
    const disconnect = websocketService.connect((event) => {
      if (event.type === 'NEW_FAILURE') {
        let freshTx: Transaction;

        if (event.data && typeof event.data === 'object' && event.data.id) {
          // Consume directly from backend live WebSocket stream
          freshTx = event.data as Transaction;
        } else {
          // Fallback when running offline mock streamer
          injectCounterRef.current += 1;
          const nextIndex = injectCounterRef.current;
          setInjectCounter(nextIndex);
          freshTx = apiService.injectFailure(nextIndex, activeJurisdiction);
        }
        
        // Phase 1: INGESTED / FAILED in feed with deduplication guard
        setTransactions((prevTxs) => {
          if (prevTxs.some((t) => t.id === freshTx.id)) {
            return prevTxs; // Never insert duplicate transaction IDs
          }
          const updated = [freshTx, ...prevTxs];
          if (updated.length > 50) updated.pop();
          return updated;
        });

        // Focus on the newly ingested failure to highlight visual state transition
        setSelectedTxId(freshTx.id);

        const isHalted = freshTx.complianceResult?.status === 'HALTED';
        if (isHalted) {
          // Policy halted: stays FAILED_PERMANENTLY / HALTED
          return;
        }

        // Honest Lifecycle: Sequential compliant retry attempts
        const scheduleRetryAttempt = (currentAttempt: number) => {
          const delay = Math.floor(Math.random() * 500) + 1800; // 1800-2300ms
          const attemptTimer = setTimeout(() => {
            const switchHealth = freshTx.bankTelemetry.switchHealthPct;
            const isOverridden = freshTx.complianceResult?.status === 'OVERRIDDEN';
            
            let successChance = 0.82;
            if (switchHealth < 30 && !isOverridden) {
              successChance = 0.35; // Outage without secondary routing override
            } else if (isOverridden) {
              successChance = 0.88; // Rerouted via healthy ICICI secondary gateway
            }

            const isSuccess = Math.random() < successChance;

            if (isSuccess) {
              // Successfully recovered
              setTransactions((prevTxs) =>
                prevTxs.map((t) =>
                  t.id === freshTx.id
                    ? { ...t, status: 'RECOVERED', retryCount: currentAttempt }
                    : t
                )
              );
              apiService.updateTransactionStatus(freshTx.id, 'RECOVERED', false);
            } else {
              // Failed this attempt. Check if all compliant retry avenues are exhausted.
              const isExhausted = currentAttempt >= freshTx.maxRetriesAllowed;

              if (isExhausted) {
                // All compliant retries exhausted -> only now mark FAILED
                setTransactions((prevTxs) =>
                  prevTxs.map((t) =>
                    t.id === freshTx.id
                      ? { ...t, status: 'FAILED', retryCount: currentAttempt }
                      : t
                  )
                );
                apiService.updateTransactionStatus(freshTx.id, 'FAILED', false);
              } else {
                // Not exhausted: remain in RECOVERING, record retry attempt, schedule next attempt
                setTransactions((prevTxs) =>
                  prevTxs.map((t) =>
                    t.id === freshTx.id
                      ? { ...t, status: 'RECOVERING', retryCount: currentAttempt }
                      : t
                  )
                );
                apiService.updateTransactionStatus(freshTx.id, 'RECOVERING', false);

                // Schedule next attempt
                scheduleRetryAttempt(currentAttempt + 1);
              }
            }
          }, delay);

          activeTimers.current.push(attemptTimer);
        };

        // Phase 2: DIAGNOSED -> RETRYING (transition after 700ms)
        const retryTimer = setTimeout(() => {
          setTransactions((prevTxs) =>
            prevTxs.map((t) => (t.id === freshTx.id ? { ...t, status: 'RECOVERING' } : t))
          );
          apiService.updateTransactionStatus(freshTx.id, 'RECOVERING');

          // Begin attempt 1
          scheduleRetryAttempt(1);
        }, 700);

        activeTimers.current.push(retryTimer);
      }
    });

    // Synchronize stream interval delay
    websocketService.setStreamInterval(streamSpeedMs);

    return () => {
      disconnect();
      activeTimers.current.forEach(clearTimeout);
      activeTimers.current = [];
    };
  }, [isAutoStreaming, streamSpeedMs, activeJurisdiction]);

  // 3. Chaos Operations
  const handleToggleOutage = async () => {
    if (isOutageSimulated) {
      await apiService.restoreTelemetry();
      setIsOutageSimulated(false);
      console.log('💚 [CascadeGuard app] Telemetry connections restored healthy.');
    } else {
      await apiService.simulateOutage();
      setIsOutageSimulated(true);
      console.log('⚡ [CascadeGuard app] Simulating switch outages across major issuers.');
    }
    // Refresh active data states
    loadTransactions(activeJurisdiction);
  };

  const handleTriggerNonCompliantRetrySpam = () => {
    // Inject a special transaction based on active policy that will trigger a deterministic override
    let injectedTx: Transaction;
    injectCounterRef.current += 1;
    const newIdx = injectCounterRef.current;
    setInjectCounter(newIdx);

    if (activeJurisdiction === 'IN_RBI') {
      // High amount transaction (>15k Limit) representing recurring payment
      const raw = {
        id: `txn_spam_${newIdx}`,
        timestamp: new Date().toISOString(),
        amount: 28500,
        currency: 'INR',
        paymentRail: 'MANDATE' as const,
        errorCode: 'LIMIT_EXCEEDED' as const,
        errorMessage: 'Mandate limit ceiling breached.',
        bankTelemetry: bankTelemetryState['HDFC Bank'],
        aiDiagnosis: {
          rootCause: 'Merchant subscription scheduler upgraded customer without AFA session.',
          confidenceScore: 92,
          proposedAction: 'Attempt immediate retry on HDFC Bank core switch gateway.',
          suggestedDelayMinutes: 0
        },
        status: 'FAILED' as const,
        customerId: `cust_spam_${newIdx}`,
        customerName: 'Samir Malhotra',
        retryCount: 0,
        maxRetriesAllowed: 2
      };
      injectedTx = {
        ...raw,
        complianceResult: {
          status: 'HALTED',
          ruleViolated: 'RBI_E_MANDATE_AFA_LIMIT_15K',
          sanitizedAction: 'Halt automated recovery. Prompt user for Additional Factor of Authentication (AFA) approval.',
          overrideReason: 'RBI guidelines mandate customer validation (AFA/MFA) for recurring transactions exceeding ₹15,000.',
          complianceStamp: 'RBI_AFA_LIMIT_15K_REJECT',
          coolingPeriodHours: 0
        },
        status: 'FAILED_PERMANENTLY'
      };
    } else if (activeJurisdiction === 'US_NACHA') {
      // NSF failure already at maximum limits
      const raw = {
        id: `txn_spam_${newIdx}`,
        timestamp: new Date().toISOString(),
        amount: 320,
        currency: 'USD',
        paymentRail: 'NETBANKING' as const,
        errorCode: 'INSUFFICIENT_FUNDS' as const,
        errorMessage: 'ACH Return Code R01 - Insufficient Funds.',
        bankTelemetry: bankTelemetryState['Wells Fargo'],
        aiDiagnosis: {
          rootCause: 'Depleted account balance during subscription cycle.',
          confidenceScore: 89,
          proposedAction: 'Initiate automated re-presentment retry in 5 minutes.',
          suggestedDelayMinutes: 5
        },
        status: 'FAILED' as const,
        customerId: `cust_spam_${newIdx}`,
        customerName: 'Alice Springs',
        retryCount: 2, // 3rd attempt
        maxRetriesAllowed: 3
      };
      injectedTx = {
        ...raw,
        complianceResult: {
          status: 'HALTED',
          ruleViolated: 'NACHA_NSF_LIMIT_R01',
          sanitizedAction: 'Halt all re-presentment retries. Mark invoice as collections-pending.',
          overrideReason: 'NACHA guidelines strictly limit re-presentment of NSF items (return codes R01/R09) to a maximum of 3 attempts.',
          complianceStamp: 'NACHA_NSF_RE_PRESENT_LIMIT',
          coolingPeriodHours: 0
        },
        status: 'FAILED_PERMANENTLY'
      };
    } else {
      // PSD3 SCA biometric step-up requirement
      const raw = {
        id: `txn_spam_${newIdx}`,
        timestamp: new Date().toISOString(),
        amount: 850,
        currency: 'EUR',
        paymentRail: 'CARD' as const,
        errorCode: 'SCA_REQUIRED' as const,
        errorMessage: 'Strong Customer Authentication mandatory.',
        bankTelemetry: bankTelemetryState['Societe Generale'],
        aiDiagnosis: {
          rootCause: 'Card transaction flagged by high-risk merchant filters.',
          confidenceScore: 98,
          proposedAction: 'Attempt immediate retry routing via backup UK payment node.',
          suggestedDelayMinutes: 0
        },
        status: 'FAILED' as const,
        customerId: `cust_spam_${newIdx}`,
        customerName: 'Pierre Gasly',
        retryCount: 0,
        maxRetriesAllowed: 2
      };
      injectedTx = {
        ...raw,
        complianceResult: {
          status: 'HALTED',
          ruleViolated: 'PSD3_SCA_STEP_UP_SEC_11A',
          sanitizedAction: 'Suspend autonomous AI routing. Dispatch PSD3 biometrics step-up prompt to customer mobile device.',
          overrideReason: 'PSD3 SCA regulations prohibit autonomous retry routing without an active, cryptographically signed customer SCA session.',
          complianceStamp: 'PSD3_SCA_SEC_11A_BIOMETRICS',
          coolingPeriodHours: 0
        },
        status: 'FAILED_PERMANENTLY'
      };
    }

    // Insert locally to the top of list with deduplication guard
    setTransactions((prevTxs) => {
      if (prevTxs.some((t) => t.id === injectedTx.id)) return prevTxs;
      const updated = [injectedTx, ...prevTxs];
      if (updated.length > 50) updated.pop();
      return updated;
    });
    setSelectedTxId(injectedTx.id);
  };

  const handleTriggerRetry = async (txId: string) => {
    // 1. Immediately transition to RETRYING
    setTransactions((prev) =>
      prev.map((t) => (t.id === txId ? { ...t, status: 'RECOVERING' } : t))
    );
    apiService.updateTransactionStatus(txId, 'RECOVERING');

    await apiService.triggerRetry(txId, activeJurisdiction);

    // 2. Resolve recovery after 2.5 seconds
    const timer = setTimeout(() => {
      setTransactions((prev) =>
        prev.map((t) => {
          if (t.id !== txId) return t;
          const isHalted = t.complianceResult?.status === 'HALTED';
          if (isHalted) {
            apiService.updateTransactionStatus(txId, 'FAILED_PERMANENTLY', true);
            return { ...t, status: 'FAILED_PERMANENTLY', retryCount: t.retryCount + 1 };
          }
          // High recovery probability (82%) on manual trigger
          const finalStatus: Transaction['status'] = Math.random() < 0.82 ? 'RECOVERED' : 'FAILED';
          apiService.updateTransactionStatus(txId, finalStatus, true);
          return { ...t, status: finalStatus, retryCount: t.retryCount + 1 };
        })
      );
    }, 2500);

    activeTimers.current.push(timer);
  };

  // 4. Metric Calculations (Live Revenue & Recovery Statistics)
  const totalFailures = transactions.length;

  const recoveredTransactions = transactions.filter((t) => t.status === 'RECOVERED');
  const recoveredCount = recoveredTransactions.length;

  // Recovered INR (₹)
  const recoveredVolumeINR = recoveredTransactions
    .filter((t) => t.currency === 'INR')
    .reduce((sum, t) => sum + t.amount, 0);

  // Recovered USD ($)
  const recoveredVolumeUSD = recoveredTransactions
    .filter((t) => t.currency !== 'INR')
    .reduce((sum, t) => {
      const valueInUSD = t.currency === 'EUR' ? t.amount * 1.08 : t.amount;
      return sum + Math.round(valueInUSD);
    }, 0);

  // Recovery Rate: (Recovered Count / Total Ingested Count) * 100
  const recoveryRate = totalFailures > 0
    ? (recoveredCount / totalFailures) * 100
    : 0;

  const totalOverrides = transactions.filter(
    (t) => t.complianceResult?.status === 'OVERRIDDEN'
  ).length;

  const auditEntries: AuditEntry[] = generateAuditHistory(transactions);
  const selectedTransaction = transactions.find((t) => t.id === selectedTxId) || null;

  return (
    <div className="min-h-screen bg-[#070C18] text-slate-300 flex flex-col p-4 sm:p-6 select-none font-sans">
      
      {/* Header Bar */}
      <header className="flex items-center justify-between mb-6 border-b border-[#1B2C4B] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-[#012652] border border-[#0D94FB]/40 rounded-lg text-[#0D94FB] shadow-sm">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-2 leading-none mb-1">
              CascadeGuard
              <span className="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-[#0B1426] border border-[#1B2C4B] text-[#0D94FB]">
                Sentinel Engine v2.5
              </span>
            </h1>
            <p className="text-xs text-slate-400">Razorpay Autonomous Revenue Recovery & Regulatory Gatekeeper</p>
          </div>
        </div>

        {/* Info panel */}
        <div className="hidden lg:flex items-center gap-6 text-right">
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">AI Engine</span>
            <span className="font-mono text-xs text-slate-300 flex items-center justify-end gap-1">
              <Cpu className="w-3.5 h-3.5 text-[#0D94FB]" /> Gemini 2.5 Flash
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block mb-0.5">Compliance Ledger</span>
            <span className="font-mono text-xs text-emerald-400 flex items-center justify-end gap-1">
              <Database className="w-3.5 h-3.5 text-emerald-500/80" /> Block-Locked
            </span>
          </div>
        </div>
      </header>

      {/* Top Metrics Strip */}
      <TopMetricBar
        totalFailures={totalFailures}
        recoveredVolumeINR={recoveredVolumeINR}
        recoveredVolumeUSD={recoveredVolumeUSD}
        recoveryRate={recoveryRate}
        jurisdiction={activeJurisdiction}
        totalOverrides={totalOverrides}
        isOutageSimulated={isOutageSimulated}
      />

      {/* Main 3-Column Console Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        
        {/* Left Column: Live Failure Feed */}
        <div className="lg:col-span-1">
          <LiveFailureFeed
            transactions={transactions}
            selectedTxId={selectedTxId}
            onSelectTransaction={setSelectedTxId}
            isAutoStreaming={isAutoStreaming}
            onToggleAutoStream={() => setIsAutoStreaming(!isAutoStreaming)}
            streamSpeedMs={streamSpeedMs}
            onChangeStreamSpeed={setStreamSpeedMs}
          />
        </div>

        {/* Center Column: Diagnostic Inspector */}
        <div className="lg:col-span-1">
          <DiagnosticInspector
            transaction={selectedTransaction}
            onTriggerRetry={handleTriggerRetry}
            activeJurisdiction={activeJurisdiction}
          />
        </div>

        {/* Right Column: Compliance Matrix */}
        <div className="lg:col-span-1">
          <ComplianceMatrix
            transaction={selectedTransaction}
            selectedJurisdiction={activeJurisdiction}
            onChangeJurisdiction={setActiveJurisdiction}
          />
        </div>

      </div>

      {/* Bottom Panel Grid (Chaos Control + Ledger) */}
      <div className="space-y-6">
        {/* Chaos Controller */}
        <ChaosControlPanel
          isOutageSimulated={isOutageSimulated}
          onToggleOutage={handleToggleOutage}
          onTriggerNonCompliantRetrySpam={handleTriggerNonCompliantRetrySpam}
          activeJurisdiction={activeJurisdiction}
          onBenchmarkCompleted={() => loadTransactions(activeJurisdiction)}
        />

        {/* Cryptographic Ledger Table */}
        <AuditLedgerTable auditEntries={auditEntries} />
      </div>

      {/* Page Footer */}
      <footer className="mt-8 text-center text-[10px] text-slate-500 border-t border-slate-800/80 pt-4 flex justify-between items-center">
        <span>© 2026 CascadeGuard Corp. All rights reserved. Secured under RBI e-mandate licensing.</span>
        <span>Node telemetry latency sync check: PASS</span>
      </footer>

    </div>
  );
};
