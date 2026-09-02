import React, { useState, useMemo } from 'react';
import { Search, Play, Pause, AlertCircle, RefreshCw, CheckCircle2, WifiOff, X } from 'lucide-react';
import { Transaction } from '../types/transaction';

interface LiveFailureFeedProps {
  transactions: Transaction[];
  selectedTxId: string | null;
  onSelectTransaction: (txId: string) => void;
  isAutoStreaming: boolean;
  onToggleAutoStream: () => void;
  streamSpeedMs: number;
  onChangeStreamSpeed: (ms: number) => void;
}

export type StatusTab = 'ALL' | 'FAILED' | 'RECOVERING' | 'RECOVERED' | 'HALTED';

export const LiveFailureFeed: React.FC<LiveFailureFeedProps> = ({
  transactions,
  selectedTxId,
  onSelectTransaction,
  isAutoStreaming,
  onToggleAutoStream,
  streamSpeedMs,
  onChangeStreamSpeed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<StatusTab>('ALL');

  // Unified Filtering Logic with useMemo
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // 1. Status / Tab Normalization
      const rawStatus = (tx.status || '').toUpperCase();
      const rawRecoveryStatus = ((tx as any).recoveryStatus || '').toUpperCase();
      const complianceStatus = (tx.complianceResult?.status || (tx as any).complianceStatus || '').toUpperCase();
      
      const isHalted = 
        rawStatus === 'HALTED' ||
        rawStatus === 'FAILED_PERMANENTLY' ||
        rawStatus === 'SUSPENDED' ||
        rawRecoveryStatus === 'BLOCKED' ||
        rawRecoveryStatus === 'HALTED' ||
        complianceStatus === 'HALTED';

      const isRecovered =
        rawStatus === 'RECOVERED' ||
        rawRecoveryStatus === 'SUCCESS' ||
        rawRecoveryStatus === 'RECOVERED';

      const isRecovering =
        rawStatus === 'RECOVERING' ||
        rawStatus === 'RETRYING' ||
        rawRecoveryStatus === 'RETRYING' ||
        rawRecoveryStatus === 'PENDING' ||
        rawRecoveryStatus === 'RECOVERING';

      const isFailed =
        (rawStatus === 'FAILED' ||
        rawStatus === 'UNRECOVERED' ||
        rawRecoveryStatus === 'FAILED' ||
        rawRecoveryStatus === 'UNRECOVERED') && !isHalted;

      let matchesTab = false;
      switch (activeTab) {
        case 'ALL':
          matchesTab = true;
          break;
        case 'RECOVERED':
          matchesTab = isRecovered;
          break;
        case 'RECOVERING':
          matchesTab = isRecovering;
          break;
        case 'HALTED':
          matchesTab = isHalted;
          break;
        case 'FAILED':
          matchesTab = isFailed;
          break;
      }

      if (!matchesTab) return false;

      // 2. Search Filter Logic across all possible entity identifiers
      const q = searchQuery.trim().toLowerCase();
      if (!q) return true;

      const txId = (tx.id || (tx as any).txId || '').toLowerCase();
      const customer = (tx.customerName || (tx as any).customer || '').toLowerCase();
      const errorCode = (tx.errorCode || (tx as any).error || '').toLowerCase();
      const bank = (tx.bankTelemetry?.bankName || (tx as any).bankName || (tx as any).bank || '').toLowerCase();
      const rail = (tx.paymentRail || (tx as any).rail || '').toLowerCase();
      const amountStr = String(tx.amount || '').toLowerCase();
      const errorMsg = (tx.errorMessage || '').toLowerCase();

      return (
        txId.includes(q) ||
        customer.includes(q) ||
        errorCode.includes(q) ||
        bank.includes(q) ||
        rail.includes(q) ||
        amountStr.includes(q) ||
        errorMsg.includes(q)
      );
    });
  }, [transactions, activeTab, searchQuery]);

  const getStatusColor = (tx: Transaction) => {
    const isHalted = tx.status === 'FAILED_PERMANENTLY' || tx.status === 'SUSPENDED' || tx.complianceResult?.status === 'HALTED';
    if (isHalted) {
      return 'border-l-amber-500';
    }
    switch (tx.status) {
      case 'RECOVERED':
        return 'border-l-emerald-500';
      case 'RECOVERING':
        return 'border-l-sky-400';
      case 'FAILED':
      default:
        return 'border-l-rose-500';
    }
  };

  const getStatusBadge = (tx: Transaction) => {
    const isHalted = tx.status === 'FAILED_PERMANENTLY' || tx.status === 'SUSPENDED' || tx.complianceResult?.status === 'HALTED';
    
    if (isHalted) {
      let haltLabel = 'POLICY LIMIT';
      if (tx.complianceResult?.ruleViolated) {
        if (tx.complianceResult.ruleViolated.includes('RBI')) haltLabel = 'RBI LIMIT';
        else if (tx.complianceResult.ruleViolated.includes('NACHA')) haltLabel = 'NACHA CAP';
        else if (tx.complianceResult.ruleViolated.includes('PSD3')) haltLabel = 'PSD3 SCA';
        else haltLabel = tx.complianceResult.ruleViolated.slice(0, 9);
      }
      return (
        <span className="flex items-center gap-1 text-xs bg-rose-950/60 text-rose-300 px-2 py-0.5 rounded border border-rose-700/60 font-semibold tracking-tight">
          <WifiOff className="w-3 h-3 text-rose-400" /> HALTED ({haltLabel})
        </span>
      );
    }

    switch (tx.status) {
      case 'RECOVERING':
        return (
          <span className="flex items-center gap-1.5 text-xs bg-sky-950/60 text-sky-400 px-2.5 py-0.5 rounded border border-sky-500/60 font-medium animate-pulse shadow-sm shadow-sky-950">
            <RefreshCw className="w-3 h-3 text-sky-400 animate-spin" /> RETRYING...
          </span>
        );
      case 'RECOVERED':
        return (
          <span className="flex items-center gap-1.5 text-xs bg-emerald-950/60 text-emerald-400 px-2.5 py-0.5 rounded border border-emerald-500/60 font-semibold shadow-sm shadow-emerald-950">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> RECOVERED
          </span>
        );
      case 'FAILED':
      default:
        return (
          <span className="flex items-center gap-1 text-xs bg-rose-950/40 text-rose-400 px-2.5 py-0.5 rounded border border-rose-800/50 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400/80" /> UNRECOVERED
          </span>
        );
    }
  };

  const getComplianceStatusBadge = (status: string | undefined) => {
    if (!status) return null;
    switch (status) {
      case 'PASSED_CLEAN':
        return (
          <span className="text-xs bg-emerald-950/40 text-emerald-400 px-2 py-0.5 rounded border border-emerald-700/60 font-semibold">
            CLEAN PASS
          </span>
        );
      case 'OVERRIDDEN':
        return (
          <span className="text-xs bg-amber-950/40 text-amber-400 px-2 py-0.5 rounded border border-amber-700/60 font-semibold">
            OVERRIDDEN
          </span>
        );
      case 'HALTED':
        return (
          <span className="text-xs bg-rose-950/40 text-rose-455 px-2 py-0.5 rounded border border-rose-700/60 font-semibold">
            HALTED
          </span>
        );
      default:
        return null;
    }
  };

  const getRailBadge = (rail: string) => {
    return (
      <span className="text-xs bg-slate-900 border border-slate-700/60 text-slate-300 px-2 py-0.5 rounded font-mono font-medium">
        {rail}
      </span>
    );
  };

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString('en-US', { hour12: false });
    } catch {
      return '--:--:--';
    }
  };

  return (
    <div className="bg-[#131B2E] border border-slate-700/60 rounded-md flex flex-col h-[calc(100vh-170px)] overflow-hidden">
      {/* Feed Title & Streaming Control */}
      <div className="p-4 border-b border-slate-700 bg-[#131B2E] flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-slate-100 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            Live Failure Feed
          </h2>
          <p className="text-xs tracking-wide uppercase font-semibold text-slate-400 mt-1">Real-time webhook ingestion pipeline</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Speed slider */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400 mr-1">
            <span>Interval:</span>
            <select
              value={streamSpeedMs}
              onChange={(e) => onChangeStreamSpeed(Number(e.target.value))}
              className="bg-[#0B0F17] border border-slate-700 text-slate-200 rounded px-1.5 py-1 text-[11px] focus:outline-none focus:border-indigo-650"
            >
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={4000}>4s</option>
              <option value={8000}>8s</option>
            </select>
          </div>

          <button
            onClick={onToggleAutoStream}
            className={`flex items-center gap-1 h-8 px-3 text-xs font-semibold rounded border transition-colors ${
              isAutoStreaming
                ? 'bg-amber-950/40 border-amber-700/60 text-amber-400 hover:bg-amber-950/60'
                : 'bg-indigo-950/40 border-indigo-700/60 text-indigo-400 hover:bg-indigo-950/60'
            }`}
          >
            {isAutoStreaming ? (
              <>
                <Pause className="w-3.5 h-3.5" /> Pause
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" /> Stream
              </>
            )}
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="p-3 border-b border-slate-700 bg-[#131B2E] space-y-2.5">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search TxID, customer, error, bank, rail, amount..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#0B0F17] border border-slate-700/60 rounded pl-9 pr-8 py-2 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-600 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              title="Clear search"
              className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-200 rounded transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Segmented Filter Control */}
        <div className="flex p-0.5 bg-[#0B0F17] border border-slate-700 rounded overflow-x-auto scrollbar-none">
          {(['ALL', 'FAILED', 'RECOVERING', 'RECOVERED', 'HALTED'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`text-xs flex-1 py-1.5 px-2 text-center rounded font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'bg-[#1E293B] text-slate-100 shadow-sm border border-slate-650'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* List container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0B0F17]">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4 space-y-2">
            <div className="p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-500">
              <Search className="w-5 h-5" />
            </div>
            <span className="text-sm font-semibold text-slate-300 font-mono">
              No matching events found
            </span>
            <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
              {searchQuery
                ? `No transactions match query "${searchQuery}" in ${activeTab} tab.`
                : `No transactions currently in ${activeTab} state.`}
            </p>
            {(searchQuery || activeTab !== 'ALL') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setActiveTab('ALL');
                }}
                className="mt-2 text-xs font-semibold px-3 py-1 rounded bg-indigo-950/60 border border-indigo-700/60 text-indigo-300 hover:bg-indigo-900/60 transition-colors"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isSelected = tx.id === selectedTxId;
            return (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction(tx.id)}
                className={`bg-[#131B2E] border border-slate-700/60 p-3.5 rounded border-l-2 ${getStatusColor(
                  tx
                )} cursor-pointer select-none transition-colors ${
                  isSelected
                    ? 'bg-slate-800/20 border-slate-650/80 border-l-indigo-500'
                    : 'hover:bg-slate-800/10'
                }`}
              >
                {/* Header Row */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-sm font-semibold text-slate-200">
                    {tx.id}
                  </span>
                  <span className="text-xs text-slate-400 font-mono tracking-tight">
                    {formatTime(tx.timestamp)}
                  </span>
                </div>

                {/* Amount and Name Row */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-base font-bold text-slate-100 truncate max-w-[150px]">
                    {tx.customerName}
                  </span>
                  <span className="text-base font-bold text-slate-100 font-mono tracking-tight tabular-nums">
                    {tx.currency === 'INR' ? '₹' : tx.currency === 'EUR' ? '€' : '$'}
                    {tx.amount.toLocaleString()}
                  </span>
                </div>

                {/* Sub Badges Grid */}
                <div className="flex flex-wrap gap-1.5 items-center justify-between pt-1.5 border-t border-slate-850/60">
                  <div className="flex gap-1.5 items-center">
                    {getRailBadge(tx.paymentRail)}
                    <span className="text-xs text-slate-400 uppercase tracking-wider font-mono truncate max-w-[100px]">
                      {tx.bankTelemetry.bankName.replace(' Bank', '').split(' (')[0]}
                    </span>
                  </div>
                  <div className="flex gap-1 items-center">
                    {getComplianceStatusBadge(tx.complianceResult?.status)}
                    {getStatusBadge(tx)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Bottom Counter Panel */}
      <div className="p-3.5 bg-[#131B2E] border-t border-slate-700/60 text-xs text-slate-400 flex items-center justify-between font-mono">
        <span>Filtered: {filteredTransactions.length} of {transactions.length}</span>
        <span>Telemetry Sync: OK</span>
      </div>
    </div>
  );
};
