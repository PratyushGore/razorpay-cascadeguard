import React, { useState } from 'react';
import { Search, Database, Clock, Lock, CheckCircle2, AlertTriangle, ShieldX } from 'lucide-react';
import { AuditEntry, AuditStage } from '../types/audit';

interface AuditLedgerTableProps {
  auditEntries: AuditEntry[];
}

export const AuditLedgerTable: React.FC<AuditLedgerTableProps> = ({ auditEntries }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredEntries = auditEntries.filter((entry) => 
    entry.txId.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entry.blockHash.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (entry.complianceStamp && entry.complianceStamp.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStageBadge = (stage: AuditStage) => {
    switch (stage) {
      case 'INGESTED':
        return (
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-705 text-xs font-semibold text-slate-400 font-mono">
            INGESTED
          </span>
        );
      case 'DIAGNOSED':
        return (
          <span className="px-2.5 py-1 rounded bg-sky-950/40 border border-sky-850/50 text-xs font-semibold text-sky-400 font-mono">
            DIAGNOSED
          </span>
        );
      case 'GATED':
        return (
          <span className="px-2.5 py-1 rounded bg-amber-950/40 border border-amber-850/50 text-xs font-semibold text-amber-400 font-mono">
            GATED
          </span>
        );
      case 'DISPATCHED':
        return (
          <span className="px-2.5 py-1 rounded bg-sky-950/40 border border-sky-700/50 text-xs font-semibold text-sky-400 font-mono">
            DISPATCHED
          </span>
        );
      case 'EXECUTED_RECOVERED':
        return (
          <span className="px-2.5 py-1 rounded bg-emerald-950/50 border border-emerald-500/60 text-xs font-semibold text-emerald-400 font-mono flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-emerald-400" /> RECOVERED
          </span>
        );
      default:
        return null;
    }
  };

  const getComplianceStatusBadge = (details: string | undefined) => {
    if (!details) return null;
    const lower = details.toLowerCase();
    
    if (lower.includes('halted') || lower.includes('failed_permanently')) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-rose-455 font-mono">
          <ShieldX className="w-4 h-4 text-rose-455" /> HALTED
        </span>
      );
    }
    
    if (lower.includes('override') || lower.includes('overridden')) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-405 font-mono">
          <AlertTriangle className="w-4 h-4 text-amber-500" /> OVERRIDDEN
        </span>
      );
    }
    
    if (lower.includes('passed') || lower.includes('clean') || lower.includes('dispatching')) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 font-mono">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" /> APPROVED
        </span>
      );
    }
    
    return (
      <span className="text-xs font-semibold text-slate-400 font-mono">
        VERIFIED
      </span>
    );
  };

  const formatTimestamp = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { hour12: false }) + '.' + date.getMilliseconds().toString().padStart(3, '0');
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div className="bg-[#131B2E] border border-slate-700/60 rounded-md overflow-hidden flex flex-col h-[320px]">
      
      {/* Header and Search */}
      <div className="p-4 border-b border-slate-700 bg-[#131B2E] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-slate-400" />
          <div>
            <h2 className="text-base font-semibold text-slate-100 flex items-center gap-2 font-mono">
              Cryptographic Audit Ledger
              <span className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-[#0B0F17] text-slate-300 border border-slate-700/60 rounded">
                <Lock className="w-3 h-3 text-slate-400" /> SHA-256
              </span>
            </h2>
            <p className="text-xs text-slate-400">Deterministic compliance chain verification ledger</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          <input
            type="text"
            placeholder="Filter ledger by TxID / Hash..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0B0F17] border border-slate-700/60 rounded pl-8 pr-3 py-1.5 text-xs text-slate-350 placeholder-slate-500 focus:outline-none focus:border-indigo-650"
          />
        </div>
      </div>

      {/* Table Body */}
      <div className="flex-1 overflow-auto bg-[#0B0F17]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#131B2E] text-slate-400 text-xs uppercase font-semibold sticky top-0 border-b border-slate-700 z-10">
            <tr>
              <th className="py-3.5 px-4 pl-4 w-36"><span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> Timestamp</span></th>
              <th className="py-3.5 px-4 w-32">TxID</th>
              <th className="py-3.5 px-4 w-36">Stage</th>
              <th className="py-3.5 px-4 w-32">Compliance</th>
              <th className="py-3.5 px-4">Block Verification Hash</th>
              <th className="py-3.5 px-4 pr-4">Transition Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-850 bg-[#0B0F17] font-mono text-xs md:text-sm text-slate-200">
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-slate-405 text-sm font-mono">
                  No cryptographic blocks recorded in current ledger.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-800/10">
                  <td className="py-3.5 px-4 pl-4 text-slate-400 font-mono tracking-tight tabular-nums">
                    {formatTimestamp(entry.timestamp)}
                  </td>
                  <td className="py-3.5 px-4 font-bold text-slate-200">
                    {entry.txId}
                  </td>
                  <td className="py-3.5 px-4">
                    {getStageBadge(entry.stage)}
                  </td>
                  <td className="py-3.5 px-4">
                    {getComplianceStatusBadge(entry.details)}
                  </td>
                  <td className="py-3.5 px-4 text-indigo-400 hover:text-indigo-350 font-mono tracking-tight tabular-nums truncate max-w-[200px]" title={entry.blockHash}>
                    {entry.blockHash.slice(0, 18)}...
                  </td>
                  <td className="py-3.5 px-4 pr-4 text-slate-200 truncate max-w-[320px] font-mono" title={entry.details}>
                    {entry.details}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Footer statistics */}
      <div className="p-3 bg-[#131B2E] border-t border-slate-700/60 text-xs text-slate-400 flex items-center justify-between font-mono">
        <span>Recorded blocks: {auditEntries.length}</span>
        <span>Secure Hash: SHA-256</span>
      </div>
    </div>
  );
};
