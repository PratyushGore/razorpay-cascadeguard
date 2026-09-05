import React from 'react';
import { Scale, Shield, AlertTriangle, CheckCircle, HelpCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import { Jurisdiction, ComplianceRule } from '../types/compliance';
import { Transaction } from '../types/transaction';

interface ComplianceMatrixProps {
  transaction: Transaction | null;
  selectedJurisdiction: Jurisdiction;
  onChangeJurisdiction: (jurisdiction: Jurisdiction) => void;
}

const JURISDICTION_RULES: Record<Jurisdiction, ComplianceRule[]> = {
  IN_RBI: [
    {
      id: 'RBI_BANK_DOWNTIME_GATE_V2',
      name: 'Bank Switch Downtime Gatekeeper',
      description: 'Blocks recovery retries to a node with health < 60% to avoid overloading core banking infrastructure.',
      jurisdiction: 'IN_RBI',
      legalReference: 'RBI Directives on Payment System Resilience Sec 4.2'
    },
    {
      id: 'RBI_MANDATE_COOLING_SEC_4C',
      name: 'Mandate Velocity Cooling-Off Limit',
      description: 'Enforces a strict 24-hour cooling off period between mandate execution retries following a speed fail.',
      jurisdiction: 'IN_RBI',
      legalReference: 'RBI Master Direction on Digital Payments Sec 4C'
    },
    {
      id: 'RBI_E_MANDATE_AFA_LIMIT_15K',
      name: 'E-Mandate Additional Factor of Authentication (AFA)',
      description: 'Enforces explicit customer multi-factor authentication (AFA) for recurring transactions exceeding ₹15,000.',
      jurisdiction: 'IN_RBI',
      legalReference: 'RBI Circular RBI/2021-22/105'
    }
  ],
  US_NACHA: [
    {
      id: 'NACHA_NSF_LIMIT_R01',
      name: 'ACH Return Limit (NSF Re-Presentments)',
      description: 'Strictly limits NSF re-presentment retries (Return Codes R01/R09) to a maximum of 3 attempts.',
      jurisdiction: 'US_NACHA',
      legalReference: 'NACHA Operating Rules Art II, Sec 2.1.2'
    },
    {
      id: 'NACHA_VELOCITY_VEL_4B',
      name: 'Unusual Velocity Gate Check',
      description: 'Caps automated recurring retries to a max of 1 attempt per 7-day window without explicit customer validation.',
      jurisdiction: 'US_NACHA',
      legalReference: 'NACHA Risk Management Guidelines v3'
    }
  ],
  EU_PSD3: [
    {
      id: 'PSD3_SCA_STEP_UP_SEC_11A',
      name: 'Strong Customer Authentication (SCA) Step-up',
      description: 'Blocks autonomous retries on card transactions requiring biometric SCA. Intercepts and fires user step-up verification.',
      jurisdiction: 'EU_PSD3',
      legalReference: 'PSD3 Title III, Chapter 2 Regulations'
    },
    {
      id: 'PSD3_MANDATE_CAP_500EUR',
      name: 'Direct Debit Amount Ceiling Enforcer',
      description: 'Forces full customer SCA verification for automated direct debits exceeding €500.',
      jurisdiction: 'EU_PSD3',
      legalReference: 'PSD3 Draft Standards Article 55'
    }
  ]
};

export const ComplianceMatrix: React.FC<ComplianceMatrixProps> = ({
  transaction,
  selectedJurisdiction,
  onChangeJurisdiction,
}) => {
  const activeRules = JURISDICTION_RULES[selectedJurisdiction];

  const getStatusBannerClass = (status: string) => {
    switch (status) {
      case 'PASSED_CLEAN':
        return 'bg-emerald-950/40 border-emerald-700/60 text-emerald-400';
      case 'OVERRIDDEN':
        return 'bg-amber-950/40 border-amber-700/60 text-amber-400';
      case 'HALTED':
        return 'bg-rose-950/40 border-rose-700/60 text-rose-455';
      default:
        return 'bg-slate-900 border-slate-700/60 text-slate-400';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PASSED_CLEAN':
        return <CheckCircle className="w-4 h-4 text-emerald-400" />;
      case 'OVERRIDDEN':
        return <AlertTriangle className="w-4 h-4 text-amber-400" />;
      case 'HALTED':
        return <ShieldAlert className="w-4 h-4 text-rose-455" />;
      default:
        return <HelpCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg flex flex-col h-[calc(100vh-170px)] overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-3.5 border-b border-[#1B2C4B] bg-[#012652]/30">
        <h2 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
          <Scale className="w-4 h-4 text-[#0D94FB]" />
          Compliance Gatekeeper
        </h2>
        <p className="text-[11px] tracking-wide uppercase font-semibold text-slate-400 mt-0.5">Deterministic Multi-Jurisdiction Guardrails</p>
      </div>

      {/* Jurisdiction Switcher */}
      <div className="p-3 bg-[#0B1426] border-b border-[#1B2C4B]">
        <label className="text-xs font-semibold text-slate-400 uppercase tracking-wide block mb-1">
          Regulatory Jurisdiction
        </label>
        <select
          value={selectedJurisdiction}
          onChange={(e) => onChangeJurisdiction(e.target.value as Jurisdiction)}
          className="w-full bg-[#070C18] border border-[#1B2C4B] rounded h-9 text-xs font-semibold px-3 focus:outline-none focus:border-[#0D94FB] text-slate-200"
        >
          <option value="IN_RBI">India - Reserve Bank of India (RBI)</option>
          <option value="US_NACHA">United States - NACHA ACH Network</option>
          <option value="EU_PSD3">European Union - PSD3 Regulations</option>
        </select>
      </div>

      {/* Inspector Details */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#070C18]">
        {!transaction ? (
          /* Summary Rules View when no Tx selected */
          <div className="space-y-3">
            <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold block">
              Active Rules for {selectedJurisdiction === 'IN_RBI' ? 'RBI' : selectedJurisdiction === 'US_NACHA' ? 'NACHA' : 'PSD3'}
            </span>
            <div className="space-y-2.5">
              {activeRules.map((rule) => (
                <div key={rule.id} className="bg-[#0B1426] border border-[#1B2C4B] rounded-lg p-3.5">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Shield className="w-3.5 h-3.5 text-[#0D94FB]" />
                    <span className="text-xs font-bold text-white">{rule.name}</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-2.5">
                    {rule.description}
                  </p>
                  <span className="text-[11px] bg-[#070C18] px-2 py-0.5 border border-[#1B2C4B] text-[#0D94FB] font-mono rounded">
                    Ref: {rule.legalReference}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Active Comparison View */
          <div className="space-y-4">
            {/* 1. Gatekeeper Status Banner */}
            {transaction.complianceResult && (
              <div className={`px-3.5 py-2.5 rounded-lg border flex items-center justify-between text-xs font-bold tracking-wide ${getStatusBannerClass(transaction.complianceResult.status)}`}>
                <div className="flex items-center gap-2">
                  {getStatusIcon(transaction.complianceResult.status)}
                  <div>
                    <span className="text-[10px] uppercase font-bold tracking-wider block leading-none mb-0.5 opacity-80">
                      Gatekeeper Evaluation
                    </span>
                    <span className="text-xs font-bold font-mono tracking-wide">
                      {transaction.complianceResult.status === 'PASSED_CLEAN'
                        ? 'PASSED_CLEAN'
                        : transaction.complianceResult.status === 'OVERRIDDEN'
                        ? 'DETERMINISTIC OVERRIDE ENFORCED'
                        : 'RECOVERY HALTED'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Side-by-side comparison with high-contrast distinct labeling */}
            <div className="space-y-2.5">
              {/* Step 1: AI Recommendation */}
              <div className="border-2 border-[#0D94FB]/50 bg-[#012652]/25 p-3.5 rounded-lg shadow-sm">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0D94FB]/20 text-[#0D94FB] border border-[#0D94FB]/30">
                    STEP 1 — AI PROPOSAL (Non-Deterministic)
                  </span>
                  <span className="text-[10px] font-mono text-[#0D94FB] font-semibold">
                    Conf: {transaction.aiDiagnosis.confidenceScore}%
                  </span>
                </div>
                <p className="text-xs font-bold text-white leading-relaxed">
                  "{transaction.aiDiagnosis.proposedAction}"
                </p>
              </div>

              {/* Transition Indicator */}
              <div className="flex items-center justify-center gap-2 py-0.5">
                <div className="h-px flex-1 bg-[#1B2C4B]"></div>
                <span className="text-[9px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded bg-[#0B1426] border border-[#1B2C4B] text-slate-400">
                  Passed to Rulebook FSM ↓
                </span>
                <div className="h-px flex-1 bg-[#1B2C4B]"></div>
              </div>

              {/* Step 2: Compliance Rule Engine */}
              <div className={`p-3.5 rounded-lg border-2 shadow-sm ${
                transaction.complianceResult?.status === 'PASSED_CLEAN'
                  ? 'border-emerald-500/70 bg-emerald-950/30 text-emerald-300'
                  : transaction.complianceResult?.status === 'OVERRIDDEN'
                  ? 'border-amber-500/70 bg-amber-950/30 text-amber-300'
                  : 'border-rose-500/70 bg-rose-950/30 text-rose-300'
              }`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                    transaction.complianceResult?.status === 'PASSED_CLEAN'
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-300'
                      : transaction.complianceResult?.status === 'OVERRIDDEN'
                      ? 'bg-amber-950/60 border-amber-500/60 text-amber-300'
                      : 'bg-rose-950/60 border-rose-500/60 text-rose-300'
                  }`}>
                    STEP 2 — REGULATORY GUARDRAIL (Deterministic Law)
                  </span>
                </div>
                
                {transaction.complianceResult?.status === 'PASSED_CLEAN' ? (
                  <p className="text-xs text-emerald-300 font-semibold">
                    ✓ Approved. The AI recovery action respects all active statutory policies.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <p className="text-xs text-white font-bold leading-relaxed">
                      {transaction.complianceResult?.sanitizedAction}
                    </p>
                  </div>
                )}

                {transaction.complianceResult?.ruleViolated && (
                  <div className="mt-2.5 pt-2 border-t border-slate-700/60 space-y-1 text-xs">
                    <div className="text-slate-300 font-medium">
                      Violated Policy: <span className="text-amber-400 font-bold font-mono">{transaction.complianceResult.ruleViolated}</span>
                    </div>
                    <div className="text-slate-300 leading-normal">
                      Mandated Reason: <span className="text-slate-200">{transaction.complianceResult.overrideReason}</span>
                    </div>
                    {transaction.complianceResult.coolingPeriodHours && (
                      <div className="text-slate-300">
                        Required Cooling: <span className="text-[#0D94FB] font-bold font-mono">{transaction.complianceResult.coolingPeriodHours} hours</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* 3. Cryptographic Stamp Card */}
            {transaction.complianceResult?.complianceStamp && (
              <div className="border border-[#1B2C4B] bg-[#0B1426] rounded-lg p-3 text-center">
                <span className="text-[10px] text-slate-400 block mb-1 uppercase font-semibold tracking-wide">Cryptographic Compliance Receipt</span>
                <span className="font-mono text-[11px] font-bold text-amber-400 bg-[#070C18] border border-[#1B2C4B] px-2.5 py-1 rounded inline-block tracking-wider">
                  {transaction.complianceResult.complianceStamp}
                </span>
                <span className="text-[10px] text-slate-400 mt-1.5 block font-mono">
                  Deterministically signed by Sentinel Engine. Hash logged to cryptoledger.
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer policy details */}
      <div className="p-3 bg-[#012652]/30 border-t border-[#1B2C4B] text-xs text-slate-400 flex items-center justify-between">
        <span>Active Rules: {activeRules.length}</span>
        <span className="flex items-center gap-1 font-mono text-[11px]">
          <Shield className="w-3.5 h-3.5 text-[#0D94FB]" /> Gatekeeper: ACTIVE
        </span>
      </div>
    </div>
  );
};
