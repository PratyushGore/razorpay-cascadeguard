import { Transaction, PaymentRail, ErrorCode, BankTelemetry } from '../types/transaction';
import { GatekeeperResult, Jurisdiction } from '../types/compliance';
import { AuditEntry } from '../types/audit';

// Helper to generate realistic deterministic SHA-256 style hashes
export function generateBlockHash(txId: string, stage: string, stamp?: string): string {
  const str = `${txId}-${stage}-${stamp || ''}-cascadeguard-crypto-salt-2026`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const hex = Math.abs(hash).toString(16).padStart(8, '0');
  const dummyHex = 'e82b7c9f4d1e0a8b9c6f2e3d5a4b7f8c2e1d0f9a8b7c6d5e4f3a2b1c0';
  return `0x${hex}${dummyHex.slice(0, 54)}`;
}

// Initial bank telemetry health settings
export let bankTelemetryState: Record<string, BankTelemetry> = {
  'HDFC Bank': { bankName: 'HDFC Bank', switchHealthPct: 52, latencyMs: 380, status: 'DEGRADED' },
  'State Bank of India (SBI)': { bankName: 'State Bank of India (SBI)', switchHealthPct: 45, latencyMs: 720, status: 'DEGRADED' },
  'ICICI Bank': { bankName: 'ICICI Bank', switchHealthPct: 96, latencyMs: 45, status: 'HEALTHY' },
  'Chase Bank': { bankName: 'Chase Bank', switchHealthPct: 98, latencyMs: 30, status: 'HEALTHY' },
  'Barclays': { bankName: 'Barclays', switchHealthPct: 88, latencyMs: 65, status: 'HEALTHY' },
  'Wells Fargo': { bankName: 'Wells Fargo', switchHealthPct: 35, latencyMs: 980, status: 'DOWN' },
  'Societe Generale': { bankName: 'Societe Generale', switchHealthPct: 94, latencyMs: 40, status: 'HEALTHY' }
};

// Reset or change telemetry values
export function simulateBankOutage() {
  bankTelemetryState['HDFC Bank'] = { bankName: 'HDFC Bank', switchHealthPct: 22, latencyMs: 1450, status: 'DOWN' };
  bankTelemetryState['State Bank of India (SBI)'] = { bankName: 'State Bank of India (SBI)', switchHealthPct: 15, latencyMs: 2500, status: 'DOWN' };
  bankTelemetryState['Wells Fargo'] = { bankName: 'Wells Fargo', switchHealthPct: 8, latencyMs: 4200, status: 'DOWN' };
}

export function restoreBankHealth() {
  bankTelemetryState['HDFC Bank'] = { bankName: 'HDFC Bank', switchHealthPct: 89, latencyMs: 80, status: 'HEALTHY' };
  bankTelemetryState['State Bank of India (SBI)'] = { bankName: 'State Bank of India (SBI)', switchHealthPct: 92, latencyMs: 65, status: 'HEALTHY' };
  bankTelemetryState['Wells Fargo'] = { bankName: 'Wells Fargo', switchHealthPct: 94, latencyMs: 50, status: 'HEALTHY' };
}

// Dynamic Compliance Engine Evaluator
export function evaluateCompliance(tx: Omit<Transaction, 'complianceResult'>, jurisdiction: Jurisdiction): GatekeeperResult {
  // Extract details
  const telemetry = bankTelemetryState[tx.bankTelemetry.bankName] || tx.bankTelemetry;
  const isSwitchDown = telemetry.switchHealthPct < 60;
  
  if (jurisdiction === 'IN_RBI') {
    // 1. Bank switch downtime check
    if (isSwitchDown && tx.aiDiagnosis.proposedAction.toLowerCase().includes('retry') && !tx.aiDiagnosis.proposedAction.toLowerCase().includes('secondary')) {
      return {
        status: 'OVERRIDDEN',
        ruleViolated: 'RBI_BANK_DOWNTIME_GATE_V2',
        sanitizedAction: 'Route retry through secondary gateway ICICI Bank instead of HDFC/SBI.',
        overrideReason: `Bank health for ${tx.bankTelemetry.bankName} is degraded at ${telemetry.switchHealthPct}% (Threshold: 60%). Overriding AI immediate retry on same gateway to avoid retry cascade failures.`,
        complianceStamp: 'RBI_GATE_DOWNTIME_THRES_44A',
        coolingPeriodHours: 0.1 // 6 mins
      };
    }

    // 2. Mandate velocity limits
    if ((tx.errorCode === 'MANDATE_EXCEEDED' || tx.errorCode === 'VELOCITY_REJECTED') && tx.aiDiagnosis.proposedAction.toLowerCase().includes('retry')) {
      return {
        status: 'OVERRIDDEN',
        ruleViolated: 'RBI_MANDATE_COOLING_SEC_4C',
        sanitizedAction: 'Suspend automated retry. Queue transaction retry after 24 hours.',
        overrideReason: 'RBI Master Directions for recurring mandates prohibit consecutive retry attempts within 24 hours of a customer-velocity rejection.',
        complianceStamp: 'RBI_MANDATE_SEC_4C_COOLING',
        coolingPeriodHours: 24
      };
    }

    // 3. RBI transaction value thresholds without AFA (Limit ₹15,000)
    if (tx.amount > 15000 && tx.currency === 'INR' && tx.paymentRail === 'MANDATE') {
      return {
        status: 'HALTED',
        ruleViolated: 'RBI_E_MANDATE_AFA_LIMIT_15K',
        sanitizedAction: 'Halt automated recovery. Prompt user for Additional Factor of Authentication (AFA) approval.',
        overrideReason: 'RBI guidelines mandate customer validation (AFA/MFA) for recurring transactions exceeding ₹15,000.',
        complianceStamp: 'RBI_AFA_LIMIT_15K_REJECT',
        coolingPeriodHours: 0
      };
    }
  }

  if (jurisdiction === 'US_NACHA') {
    // 1. NACHA Insufficient Funds Re-Presentment attempts limit (Maximum 3)
    if (tx.errorCode === 'INSUFFICIENT_FUNDS' && tx.retryCount >= 2) {
      return {
        status: 'HALTED',
        ruleViolated: 'NACHA_NSF_LIMIT_R01',
        sanitizedAction: 'Halt all re-presentment retries. Mark invoice as collections-pending.',
        overrideReason: 'NACHA guidelines strictly limit re-presentment of NSF items (return codes R01/R09) to a maximum of 3 attempts.',
        complianceStamp: 'NACHA_NSF_RE_PRESENT_LIMIT',
        coolingPeriodHours: 0
      };
    }

    // 2. Corporate Debit Authorization limit overrides
    if (tx.errorCode === 'VELOCITY_REJECTED' && tx.paymentRail === 'CARD') {
      return {
        status: 'OVERRIDDEN',
        ruleViolated: 'NACHA_VELOCITY_VEL_4B',
        sanitizedAction: 'Limit smart retries to 1 per 7 days or request new mandate.',
        overrideReason: 'US NACHA rules require manual merchant clearance when transactions trigger consecutive automated velocity flags.',
        complianceStamp: 'NACHA_CORP_VEL_4B_STAMP',
        coolingPeriodHours: 168 // 7 days
      };
    }
  }

  if (jurisdiction === 'EU_PSD3') {
    // 1. PSD3 Strong Customer Authentication requirement
    if (tx.errorCode === 'SCA_REQUIRED') {
      return {
        status: 'HALTED',
        ruleViolated: 'PSD3_SCA_STEP_UP_SEC_11A',
        sanitizedAction: 'Suspend autonomous AI routing. Dispatch PSD3 biometrics step-up prompt to customer mobile device.',
        overrideReason: 'PSD3 SCA regulations prohibit autonomous retry routing without an active, cryptographically signed customer SCA session.',
        complianceStamp: 'PSD3_SCA_SEC_11A_BIOMETRICS',
        coolingPeriodHours: 0
      };
    }

    // 2. Limit exceeded on mandate without biometrics
    if (tx.amount > 500 && tx.currency === 'EUR' && tx.paymentRail === 'MANDATE') {
      return {
        status: 'OVERRIDDEN',
        ruleViolated: 'PSD3_MANDATE_CAP_500EUR',
        sanitizedAction: 'Force SCA fallback flow. Halt direct merchant-initiated transactions.',
        overrideReason: 'Under PSD3 draft mandates, merchant-initiated debits exceeding €500 without recurring biometric enrollment require user SCA.',
        complianceStamp: 'PSD3_MANDATE_CAP_OVERRIDE',
        coolingPeriodHours: 0
      };
    }
  }

  // Clean Pass
  return {
    status: 'PASSED_CLEAN',
    sanitizedAction: tx.aiDiagnosis.proposedAction,
    overrideReason: 'Proposal satisfies all compliance rules under the selected jurisdiction. Approved for immediate dispatch.',
    complianceStamp: 'GATEKEEPER_PASSED_CLEAN_SIGN'
  };
}

// 12+ Realistic Failure Cases
export const initialFailures: Omit<Transaction, 'complianceResult'>[] = [
  {
    id: 'txn_9821',
    timestamp: '2026-08-26T00:41:10Z',
    amount: 8500,
    currency: 'INR',
    paymentRail: 'UPI',
    errorCode: 'BAD_REQUEST_TIMEOUT',
    errorMessage: 'UPI Provider timeout from issuer node. Gateway failed to respond within 15000ms.',
    bankTelemetry: bankTelemetryState['HDFC Bank'],
    aiDiagnosis: {
      rootCause: 'Transient gateway queue buildup at HDFC Switch. Switch health is degraded but not down.',
      confidenceScore: 84,
      proposedAction: 'Initiate immediate retry on the same HDFC gateway with a 15-second delay.',
      suggestedDelayMinutes: 0.25
    },
    status: 'FAILED',
    customerId: 'cust_8172',
    customerName: 'Aditya Sen',
    retryCount: 0,
    maxRetriesAllowed: 3
  },
  {
    id: 'txn_9822',
    timestamp: '2026-08-26T00:41:52Z',
    amount: 12000,
    currency: 'INR',
    paymentRail: 'MANDATE',
    errorCode: 'VELOCITY_REJECTED',
    errorMessage: 'Mandate velocity limit exceeded. Consecutive daily charge count exceeds parameter bounds.',
    bankTelemetry: bankTelemetryState['State Bank of India (SBI)'],
    aiDiagnosis: {
      rootCause: 'Repeated billing attempts triggered by merchant subscription scheduler sync lag.',
      confidenceScore: 95,
      proposedAction: 'Run intelligent rapid retry using UPI auto-debit in 5 minutes.',
      suggestedDelayMinutes: 5
    },
    status: 'FAILED',
    customerId: 'cust_9011',
    customerName: 'Rohan Sharma',
    retryCount: 1,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9823',
    timestamp: '2026-08-26T00:42:15Z',
    amount: 2500,
    currency: 'INR',
    paymentRail: 'UPI',
    errorCode: 'NETWORK_CONGESTION',
    errorMessage: 'Soft decline. SBI PSP app reported brief network congestion.',
    bankTelemetry: bankTelemetryState['State Bank of India (SBI)'],
    aiDiagnosis: {
      rootCause: 'Temporary network load spike at SBI switch.',
      confidenceScore: 92,
      proposedAction: 'Dispatch active 1-click UPI Intent link to customer to complete manually via secondary ICICI network.',
      suggestedDelayMinutes: 0
    },
    status: 'FAILED',
    customerId: 'cust_7721',
    customerName: 'Priya Patel',
    retryCount: 0,
    maxRetriesAllowed: 3
  },
  {
    id: 'txn_9824',
    timestamp: '2026-08-26T00:42:48Z',
    amount: 145,
    currency: 'USD',
    paymentRail: 'NETBANKING',
    errorCode: 'INSUFFICIENT_FUNDS',
    errorMessage: 'ACH Return Code R01 - Insufficient Funds.',
    bankTelemetry: bankTelemetryState['Wells Fargo'],
    aiDiagnosis: {
      rootCause: 'Account balance depletion. Customer bank account balance below debit amount.',
      confidenceScore: 78,
      proposedAction: 'Trigger automated retry in 12 hours (smart-retry window for paycheck cycle matching).',
      suggestedDelayMinutes: 720
    },
    status: 'FAILED',
    customerId: 'cust_1102',
    customerName: 'Jane Doe',
    retryCount: 2, // 3rd attempt coming up
    maxRetriesAllowed: 3
  },
  {
    id: 'txn_9825',
    timestamp: '2026-08-26T00:43:02Z',
    amount: 320,
    currency: 'EUR',
    paymentRail: 'CARD',
    errorCode: 'SCA_REQUIRED',
    errorMessage: 'Strong Customer Authentication required. Bank issuer requires biometrics step-up.',
    bankTelemetry: bankTelemetryState['Societe Generale'],
    aiDiagnosis: {
      rootCause: 'Merchant transaction flagged for high risk by issuer card processor.',
      confidenceScore: 99,
      proposedAction: 'Auto-route transaction through a backup non-SCA gateway in the UK.',
      suggestedDelayMinutes: 0
    },
    status: 'FAILED',
    customerId: 'cust_4009',
    customerName: 'Antoine Dubois',
    retryCount: 0,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9826',
    timestamp: '2026-08-26T00:43:18Z',
    amount: 18500,
    currency: 'INR',
    paymentRail: 'MANDATE',
    errorCode: 'LIMIT_EXCEEDED',
    errorMessage: 'RBI limit warning. Recurring mandate execution above default regulatory caps.',
    bankTelemetry: bankTelemetryState['ICICI Bank'],
    aiDiagnosis: {
      rootCause: 'Transaction amount exceeds standard e-mandate automatic cap.',
      confidenceScore: 89,
      proposedAction: 'Halt transaction, generate compliance alert, and request customer AFA verification.',
      suggestedDelayMinutes: 0
    },
    status: 'FAILED',
    customerId: 'cust_5012',
    customerName: 'Ananya Iyer',
    retryCount: 0,
    maxRetriesAllowed: 1
  },
  {
    id: 'txn_9827',
    timestamp: '2026-08-26T00:43:40Z',
    amount: 89,
    currency: 'USD',
    paymentRail: 'CARD',
    errorCode: 'INSUFFICIENT_FUNDS',
    errorMessage: 'Card issuer returned Insufficient Funds code 51.',
    bankTelemetry: bankTelemetryState['Chase Bank'],
    aiDiagnosis: {
      rootCause: 'Soft decline. Transient cash flow dip at client bank card.',
      confidenceScore: 81,
      proposedAction: 'Queue daily retry (attempt 2/3) at 6:00 AM local time.',
      suggestedDelayMinutes: 360
    },
    status: 'FAILED',
    customerId: 'cust_2281',
    customerName: 'Michael Brown',
    retryCount: 0,
    maxRetriesAllowed: 3
  },
  {
    id: 'txn_9828',
    timestamp: '2026-08-26T00:44:05Z',
    amount: 6500,
    currency: 'INR',
    paymentRail: 'NETBANKING',
    errorCode: 'SWITCH_OFFLINE',
    errorMessage: 'SBI Internet Banking gateway switch offline.',
    bankTelemetry: bankTelemetryState['State Bank of India (SBI)'],
    aiDiagnosis: {
      rootCause: 'SBI mainframe undergoing unscheduled maintenance or network routing split.',
      confidenceScore: 97,
      proposedAction: 'Prompt customer to complete checkout via alternate UPI link routed through ICICI PSP.',
      suggestedDelayMinutes: 0
    },
    status: 'FAILED',
    customerId: 'cust_3042',
    customerName: 'Sanjay Kumar',
    retryCount: 0,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9829',
    timestamp: '2026-08-26T00:44:30Z',
    amount: 650,
    currency: 'EUR',
    paymentRail: 'MANDATE',
    errorCode: 'VELOCITY_REJECTED',
    errorMessage: 'PSD3 mandate speed limit. Consecutive execution interval too short.',
    bankTelemetry: bankTelemetryState['Barclays'],
    aiDiagnosis: {
      rootCause: 'Merchant scheduler re-ran invoice batch within 12 hours.',
      confidenceScore: 91,
      proposedAction: 'Force route immediate retry on backup Credit Card rail.',
      suggestedDelayMinutes: 0
    },
    status: 'FAILED',
    customerId: 'cust_6619',
    customerName: 'Emma Watson',
    retryCount: 0,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9830',
    timestamp: '2026-08-26T00:44:50Z',
    amount: 19800,
    currency: 'INR',
    paymentRail: 'MANDATE',
    errorCode: 'LIMIT_EXCEEDED',
    errorMessage: 'Amount exceeds limits of standard recurring e-mandates.',
    bankTelemetry: bankTelemetryState['HDFC Bank'],
    aiDiagnosis: {
      rootCause: 'Customer subscription upgraded to premium enterprise tier without updating original mandate limit authorization.',
      confidenceScore: 88,
      proposedAction: 'Retry transaction by splitting it into two partial invoices (₹9,900 each) and processing in parallel.',
      suggestedDelayMinutes: 1
    },
    status: 'FAILED',
    customerId: 'cust_8812',
    customerName: 'Vikram Mehta',
    retryCount: 0,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9831',
    timestamp: '2026-08-26T00:45:00Z',
    amount: 1200,
    currency: 'USD',
    paymentRail: 'MANDATE',
    errorCode: 'LIMIT_EXCEEDED',
    errorMessage: 'ACH Return Code R10 - Customer Advises Originator is Not Authorized.',
    bankTelemetry: bankTelemetryState['Wells Fargo'],
    aiDiagnosis: {
      rootCause: 'Direct debit mandate revoked or authorization check failed at Wells Fargo core system.',
      confidenceScore: 94,
      proposedAction: 'Attempt immediate retry on customer card on file.',
      suggestedDelayMinutes: 1
    },
    status: 'FAILED',
    customerId: 'cust_9921',
    customerName: 'David Miller',
    retryCount: 0,
    maxRetriesAllowed: 2
  },
  {
    id: 'txn_9832',
    timestamp: '2026-08-26T00:45:10Z',
    amount: 3200,
    currency: 'INR',
    paymentRail: 'UPI',
    errorCode: 'BAD_REQUEST_TIMEOUT',
    errorMessage: 'UPI switch latency exceeded limit. HDFC Bank Core switch degraded.',
    bankTelemetry: bankTelemetryState['HDFC Bank'],
    aiDiagnosis: {
      rootCause: 'HDFC UPI gateway latency spiked to 2300ms. switchHealthPct is 22%.',
      confidenceScore: 86,
      proposedAction: 'Wait 30 seconds and retry on same gateway.',
      suggestedDelayMinutes: 0.5
    },
    status: 'FAILED',
    customerId: 'cust_7719',
    customerName: 'Manish Gupta',
    retryCount: 0,
    maxRetriesAllowed: 3
  }
];

// Generates simulated stream of transactions
export function generateRandomTransaction(idIndex: number): Omit<Transaction, 'complianceResult'> {
  const rails: PaymentRail[] = ['UPI', 'CARD', 'MANDATE', 'NETBANKING'];
  const errorCodes: { code: ErrorCode; msg: string }[] = [
    { code: 'BAD_REQUEST_TIMEOUT', msg: 'Timeout occurred during UPI transaction.' },
    { code: 'INSUFFICIENT_FUNDS', msg: 'Core banking switch reported insufficient balance.' },
    { code: 'SWITCH_OFFLINE', msg: 'Bank switch core router offline.' },
    { code: 'SCA_REQUIRED', msg: 'Regulatory SCA prompt required by bank issuer.' },
    { code: 'MANDATE_EXCEEDED', msg: 'Recurring mandate velocity parameters exceeded.' },
    { code: 'LIMIT_EXCEEDED', msg: 'Standard transaction limit cap breached.' },
    { code: 'VELOCITY_REJECTED', msg: 'Anti-spam velocity gate rejected attempt.' }
  ];
  const names = ['Karan Johar', 'Neha Sharma', 'Arjun Kapoor', 'Sophia Loren', 'Robert Vance', 'Carlos Santana', 'Emily Clark'];
  const banks = Object.keys(bankTelemetryState);
  
  const rail = rails[Math.floor(Math.random() * rails.length)];
  const errorObj = errorCodes[Math.floor(Math.random() * errorCodes.length)];
  const bankName = banks[Math.floor(Math.random() * banks.length)];
  const bankTelemetry = bankTelemetryState[bankName];
  const amount = Math.floor(Math.random() * 18000) + 100;
  const currency = bankName.includes('Bank of India') || bankName.includes('HDFC') || bankName.includes('ICICI') ? 'INR' : (Math.random() > 0.5 ? 'USD' : 'EUR');
  
  const proposedActions = [
    'Retry immediately on the same gateway bank.',
    'Route retry through a backup card gateway.',
    'Wait 10 minutes and attempt queue re-run.',
    'Prompt customer for authentication step-up.',
    'Split invoice amount and attempt partial debits.'
  ];
  const proposedAction = proposedActions[Math.floor(Math.random() * proposedActions.length)];

  return {
    id: `txn_${9800 + idIndex}`,
    timestamp: new Date().toISOString(),
    amount,
    currency,
    paymentRail: rail,
    errorCode: errorObj.code,
    errorMessage: errorObj.msg,
    bankTelemetry,
    aiDiagnosis: {
      rootCause: `Automated analysis detected a high probability of ${errorObj.code.toLowerCase().replace('_', ' ')} due to temporary switch traffic.`,
      confidenceScore: Math.floor(Math.random() * 40) + 60,
      proposedAction,
      suggestedDelayMinutes: Math.random() > 0.5 ? 5 : 0
    },
    status: 'FAILED',
    customerId: `cust_${Math.floor(Math.random() * 9000) + 1000}`,
    customerName: names[Math.floor(Math.random() * names.length)],
    retryCount: Math.floor(Math.random() * 2),
    maxRetriesAllowed: 3
  };
}

// Full audit entries builder based on current transaction collection and policies
export function generateAuditHistory(transactions: Transaction[]): AuditEntry[] {
  const list: AuditEntry[] = [];
  transactions.forEach((tx) => {
    const timeBase = new Date(tx.timestamp).getTime();
    
    // Stage 1: INGESTED
    list.push({
      id: generateBlockHash(tx.id, 'INGESTED'),
      timestamp: new Date(timeBase - 15000).toISOString(),
      txId: tx.id,
      stage: 'INGESTED',
      blockHash: generateBlockHash(tx.id, 'INGESTED'),
      details: `Failed transaction event ingested from webhook. Code: ${tx.errorCode}. Amount: ${tx.currency} ${tx.amount}.`
    });

    // Stage 2: DIAGNOSED
    list.push({
      id: generateBlockHash(tx.id, 'DIAGNOSED'),
      timestamp: new Date(timeBase - 10000).toISOString(),
      txId: tx.id,
      stage: 'DIAGNOSED',
      blockHash: generateBlockHash(tx.id, 'DIAGNOSED'),
      details: `Gemini AI Engine formulated diagnosis. Root cause: ${tx.aiDiagnosis.rootCause}. Proposed recovery: ${tx.aiDiagnosis.proposedAction}. Confidence: ${tx.aiDiagnosis.confidenceScore}%.`
    });

    // Stage 3: GATED
    const comp = tx.complianceResult;
    if (comp) {
      list.push({
        id: generateBlockHash(tx.id, 'GATED', comp.complianceStamp),
        timestamp: new Date(timeBase - 5000).toISOString(),
        txId: tx.id,
        stage: 'GATED',
        complianceStamp: comp.complianceStamp,
        blockHash: generateBlockHash(tx.id, 'GATED', comp.complianceStamp),
        details: `Compliance engine review. Status: ${comp.status}. Rule Evaluated: ${comp.ruleViolated || 'NONE'}. Sanitized recovery action: ${comp.sanitizedAction}. Override reason: ${comp.overrideReason || 'N/A'}.`
      });
      
      // Stage 4: DISPATCHED (only if not halted)
      if (comp.status !== 'HALTED' && tx.status !== 'FAILED') {
        list.push({
          id: generateBlockHash(tx.id, 'DISPATCHED', comp.complianceStamp),
          timestamp: new Date(timeBase).toISOString(),
          txId: tx.id,
          stage: 'DISPATCHED',
          complianceStamp: comp.complianceStamp,
          blockHash: generateBlockHash(tx.id, 'DISPATCHED', comp.complianceStamp),
          details: `Recovery dispatch engine fired webhook. Dispatching execution: "${comp.sanitizedAction}". Target gateway: ICICI/Chase. Status updated to ${tx.status}.`
        });
      }
    }
  });
  
  return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}
