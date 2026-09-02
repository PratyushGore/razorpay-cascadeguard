import React, { useState } from 'react';
import { Search, Play, Pause, AlertCircle, RefreshCw, CheckCircle2, ShieldAlert, WifiOff } from 'lucide-react';
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

export const LiveFailureFeed: React.FC<LiveFailureFeedProps> = ({
  transactions,
  selectedTxId,
  onSelectTransaction,
  isAutoStreaming,
  onToggleAutoStream,
  streamSpeedMs,
  onChangeStreamSpeed,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'FAILED' | 'RECOVERING' | 'RECOVERED' | 'FAILED_PERMANENTLY'>('ALL');

  // Filter logic
  const filteredTransactions = transactions.filter((tx) => {
    const matchesSearch = 
      tx.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.bankTelemetry.bankName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tx.errorCode.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesFilter = statusFilter === 'ALL' || tx.status === statusFilter;

    return matchesSearch && matchesFilter;
  });

  const getStatusColor = (status: Transaction['status']) => {
    switch (status) {
      case 'FAILED':
        return 'border-l-rose-500';
      case 'RECOVERING':
        return 'border-l-sky-500';
      case 'RECOVERED':
        return 'border-l-emerald-500';
      case 'FAILED_PERMANENTLY':
        return 'border-l-slate-700';
      case 'SUSPENDED':
        return 'border-l-amber-500';
      default:
        return 'border-l-slate-800';
    }
  };

  const getStatusBadge = (status: Transaction['status']) => {
    switch (status) {
      case 'FAILED':
        return (
          <span className="flex items-center gap-1 text-xs bg-rose-950/40 text-rose-455 px-2.5 py-1 rounded border border-rose-700/60 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400/80" /> FAILED
          </span>
        );
      case 'RECOVERING':
        return (
          <span className="flex items-center gap-1 text-xs bg-sky-950/40 text-sky-400 px-2.5 py-1 rounded border border-sky-700/60 font-medium">
            <RefreshCw className="w-3.5 h-3.5 text-sky-400/80 animate-spin" /> RETRYING
          </span>
        );
      case 'RECOVERED':
        return (
          <span className="flex items-center gap-1 text-xs bg-emerald-950/40 text-emerald-400 px-2.5 py-1 rounded border border-emerald-700/60 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400/80" /> RECOVERED
          </span>
        );
      case 'FAILED_PERMANENTLY':
        return (
          <span className="flex items-center gap-1 text-xs bg-slate-950 text-slate-300 px-2.5 py-1 rounded border border-slate-700/60 font-medium">
            <WifiOff className="w-3.5 h-3.5 text-slate-400" /> HALTED
          </span>
        );
      default:
        return null;
    }
  };

  const getComplianceStatusBadge = (status: string | undefined) => {
    if (!status) return null;
    switch (status) {
      case 'PASSED_CLEAN':
        return (
          <span className="text-xs bg-emerald-950/40 text-emerald-400 px-2.5 py-1 rounded border border-emerald-700/60 font-semibold">
            CLEAN PASS
          </span>
        );
      case 'OVERRIDDEN':
        return (
          <span className="text-xs bg-amber-950/40 text-amber-400 px-2.5 py-1 rounded border border-amber-700/60 font-semibold">
            OVERRIDDEN
          </span>
        );
      case 'HALTED':
        return (
          <span className="text-xs bg-rose-950/40 text-rose-455 px-2.5 py-1 rounded border border-rose-700/60 font-semibold">
            HALTED
          </span>
        );
      default:
        return null;
    }
  };

  const getRailBadge = (rail: string) => {
    return (
      <span className="text-xs bg-slate-900 border border-slate-700/60 text-slate-300 px-2.5 py-1 rounded font-mono font-medium">
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
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search TxID, customer, error..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#0B0F17] border border-slate-700/60 rounded pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:border-indigo-600 transition-colors"
          />
        </div>

        {/* Segmented Filter Control */}
        <div className="flex p-0.5 bg-[#0B0F17] border border-slate-700 rounded overflow-x-auto scrollbar-none">
          {(['ALL', 'FAILED', 'RECOVERING', 'RECOVERED', 'FAILED_PERMANENTLY'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setStatusFilter(filter)}
              className={`text-xs flex-1 py-1.5 px-2 text-center rounded font-semibold uppercase tracking-wide whitespace-nowrap transition-colors ${
                statusFilter === filter
                  ? 'bg-[#1E293B] text-slate-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {filter === 'FAILED_PERMANENTLY' ? 'HALTED' : filter}
            </button>
          ))}
        </div>
      </div>

      {/* List container */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[#0B0F17]">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400 font-mono">
            No transactions match criteria.
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isSelected = tx.id === selectedTxId;
            return (
              <div
                key={tx.id}
                onClick={() => onSelectTransaction(tx.id)}
                className={`bg-[#131B2E] border border-slate-700/60 p-3.5 rounded border-l-2 ${getStatusColor(
                  tx.status
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
                    {getStatusBadge(tx.status)}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      
      {/* Bottom Counter Panel */}
      <div className="p-3.5 bg-[#131B2E] border-t border-slate-700/60 text-xs text-slate-400 flex items-center justify-between font-mono">
        <span>Filtered: {filteredTransactions.length}</span>
        <span>Telemetry Sync: OK</span>
      </div>
    </div>
  );
};
