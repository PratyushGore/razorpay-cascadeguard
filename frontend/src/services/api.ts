import { Transaction, PaymentRail, ErrorCode, BankTelemetry } from '../types/transaction';
import { GatekeeperResult, Jurisdiction } from '../types/compliance';
import { initialFailures, evaluateCompliance, bankTelemetryState, simulateBankOutage, restoreBankHealth, generateRandomTransaction } from './mockData';

const API_BASE_URL = 'http://localhost:8000/api';

// Local volatile storage for live interactive sessions
let localTransactions: Transaction[] = [];

// Initialize transactions with compliance results pre-evaluated under active rules
export function initLocalState(jurisdiction: Jurisdiction) {
  if (localTransactions.length === 0) {
    localTransactions = initialFailures.map((t) => {
      const compliance = evaluateCompliance(t, jurisdiction);
      return {
        ...t,
        complianceResult: compliance,
        status: compliance.status === 'HALTED' ? 'FAILED_PERMANENTLY' : t.status
      };
    });
  }
}

export const apiService = {
  async getTransactions(jurisdiction: Jurisdiction): Promise<Transaction[]> {
    initLocalState(jurisdiction);
    try {
      const response = await fetch(`${API_BASE_URL}/transactions?jurisdiction=${jurisdiction}`);
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      console.log('⚡ [CascadeGuard API] Fetched live transactions from backend.');
      return data;
    } catch (e) {
      console.warn('⚠️ [CascadeGuard API] Backend offline. Falling back to local high-fidelity state.');
      
      // Update compliance results dynamically for current local state based on active jurisdiction
      localTransactions = localTransactions.map((tx) => {
        const telemetry = bankTelemetryState[tx.bankTelemetry.bankName] || tx.bankTelemetry;
        const txUpdatedTelemetry = { ...tx, bankTelemetry: telemetry };
        const complianceResult = evaluateCompliance(txUpdatedTelemetry, jurisdiction);
        
        // Adjust status if halted or unhalted
        let status = tx.status;
        if (complianceResult.status === 'HALTED') {
          status = 'FAILED_PERMANENTLY';
        } else if (status === 'FAILED_PERMANENTLY') {
          status = 'FAILED';
        }
        
        return {
          ...txUpdatedTelemetry,
          complianceResult,
          status
        };
      });
      return [...localTransactions];
    }
  },

  async triggerRetry(txId: string, jurisdiction: Jurisdiction): Promise<Transaction> {
    try {
      const response = await fetch(`${API_BASE_URL}/recovery/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ txId, jurisdiction })
      });
      if (!response.ok) throw new Error('API request failed');
      const data = await response.json();
      console.log('⚡ [CascadeGuard API] Dispatched recovery retry to backend.');
      return data;
    } catch (e) {
      console.warn(`⚠️ [CascadeGuard API] Backend offline. Running local recovery loop for ${txId}.`);
      
      const idx = localTransactions.findIndex((t) => t.id === txId);
      if (idx === -1) throw new Error('Transaction not found');
      
      const tx = localTransactions[idx];
      
      // Update switch telemetry at trigger time
      const telemetry = bankTelemetryState[tx.bankTelemetry.bankName] || tx.bankTelemetry;
      tx.bankTelemetry = telemetry;
      
      // Re-run compliance validation
      const comp = evaluateCompliance(tx, jurisdiction);
      tx.complianceResult = comp;
      tx.retryCount += 1;
      
      if (comp.status === 'HALTED') {
        tx.status = 'FAILED_PERMANENTLY';
      } else {
        tx.status = 'RECOVERING';
        
        // Simulate background recovery resolution
        setTimeout(() => {
          const finalIdx = localTransactions.findIndex((t) => t.id === txId);
          if (finalIdx !== -1) {
            const currentTx = localTransactions[finalIdx];
            const activeTelemetry = bankTelemetryState[currentTx.bankTelemetry.bankName];
            
            if (activeTelemetry.status === 'HEALTHY' || currentTx.complianceResult?.status === 'OVERRIDDEN') {
              currentTx.status = 'RECOVERED';
            } else if (activeTelemetry.status === 'DEGRADED') {
              currentTx.status = Math.random() > 0.3 ? 'RECOVERED' : 'FAILED';
            } else {
              currentTx.status = 'FAILED';
            }
            console.log(`📡 [CascadeGuard Sim] Transaction ${txId} recovery simulation completed: ${currentTx.status}`);
          }
        }, 2500);
      }
      
      localTransactions[idx] = { ...tx };
      return { ...tx };
    }
  },

  updateTransactionStatus(txId: string, status: Transaction['status'], retryIncrement: boolean = false) {
    const idx = localTransactions.findIndex((t) => t.id === txId);
    if (idx !== -1) {
      localTransactions[idx].status = status;
      if (retryIncrement) {
        localTransactions[idx].retryCount += 1;
      }
    }
  },

  async simulateOutage(): Promise<Record<string, BankTelemetry>> {
    try {
      const response = await fetch(`${API_BASE_URL}/telemetry/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'OUTAGE' })
      });
      if (!response.ok) throw new Error('API request failed');
      console.log('⚡ [CascadeGuard API] Injected bank outage into backend.');
    } catch (e) {
      console.warn('⚠️ [CascadeGuard API] Backend offline. Injecting outage in local state.');
      simulateBankOutage();
    }
    return { ...bankTelemetryState };
  },

  async restoreTelemetry(): Promise<Record<string, BankTelemetry>> {
    try {
      const response = await fetch(`${API_BASE_URL}/telemetry/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trigger: 'RESTORE' })
      });
      if (!response.ok) throw new Error('API request failed');
      console.log('⚡ [CascadeGuard API] Restored telemetry health on backend.');
    } catch (e) {
      console.warn('⚠️ [CascadeGuard API] Backend offline. Restoring telemetry in local state.');
      restoreBankHealth();
    }
    return { ...bankTelemetryState };
  },

  // Locally push simulated failed transaction on demand
  injectFailure(idIndex: number, jurisdiction: Jurisdiction): Transaction {
    const freshFailure = generateRandomTransaction(idIndex);
    const compliance = evaluateCompliance(freshFailure, jurisdiction);
    const completedTx: Transaction = {
      ...freshFailure,
      complianceResult: compliance,
      status: compliance.status === 'HALTED' ? 'FAILED_PERMANENTLY' : 'FAILED'
    };
    
    localTransactions.unshift(completedTx);
    // Keep it capped at 50 to prevent memory exhaustion
    if (localTransactions.length > 50) {
      localTransactions.pop();
    }
    
    return completedTx;
  },

  // Perform synthetic benchmark execution of 50 test cases
  async runBenchmark(jurisdiction: Jurisdiction, progressCallback: (pct: number) => void): Promise<{
    total: number;
    passedClean: number;
    overridden: number;
    halted: number;
    recoverySuccess: number;
    recoveryFail: number;
    details: { txId: string; amount: number; rail: PaymentRail; code: ErrorCode; decision: 'CLEAN' | 'OVERRIDDEN' | 'HALTED'; success: boolean }[];
  }> {
    try {
      const response = await fetch(`${API_BASE_URL}/benchmark/run?jurisdiction=${jurisdiction}`);
      if (!response.ok) throw new Error('API request failed');
      console.log('⚡ [CascadeGuard API] Executing remote benchmark suite on backend.');
      return await response.json();
    } catch (e) {
      console.warn('⚠️ [CascadeGuard API] Backend offline. Simulating 50-case benchmark locally.');
      
      const detailsList = [];
      let passedClean = 0;
      let overridden = 0;
      let halted = 0;
      let recoverySuccess = 0;
      let recoveryFail = 0;

      for (let i = 0; i < 50; i++) {
        // Slow down slightly to show smooth animation in dialog
        await new Promise((r) => setTimeout(r, 20));
        progressCallback(Math.floor(((i + 1) / 50) * 100));

        const dummyTx = generateRandomTransaction(i + 200);
        const comp = evaluateCompliance(dummyTx, jurisdiction);

        let decision: 'CLEAN' | 'OVERRIDDEN' | 'HALTED' = 'CLEAN';
        if (comp.status === 'OVERRIDDEN') {
          overridden++;
          decision = 'OVERRIDDEN';
        } else if (comp.status === 'HALTED') {
          halted++;
          decision = 'HALTED';
        } else {
          passedClean++;
        }

        let isSuccess = false;
        if (comp.status !== 'HALTED') {
          // Success chance based on telemetry health
          const h = dummyTx.bankTelemetry.switchHealthPct;
          isSuccess = Math.random() * 100 < h;
          if (isSuccess) {
            recoverySuccess++;
          } else {
            recoveryFail++;
          }
        } else {
          recoveryFail++;
        }

        detailsList.push({
          txId: dummyTx.id,
          amount: dummyTx.amount,
          rail: dummyTx.paymentRail,
          code: dummyTx.errorCode,
          decision,
          success: isSuccess
        });
      }

      return {
        total: 50,
        passedClean,
        overridden,
        halted,
        recoverySuccess,
        recoveryFail,
        details: detailsList
      };
    }
  }
};
