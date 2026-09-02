import { GatekeeperResult } from './compliance';

export type PaymentRail = 'UPI' | 'CARD' | 'MANDATE' | 'NETBANKING';

export type ErrorCode = 
  | 'BAD_REQUEST_TIMEOUT' 
  | 'INSUFFICIENT_FUNDS' 
  | 'SWITCH_OFFLINE' 
  | 'SCA_REQUIRED' 
  | 'MANDATE_EXCEEDED' 
  | 'LIMIT_EXCEEDED' 
  | 'VELOCITY_REJECTED'
  | 'NETWORK_CONGESTION';

export interface BankTelemetry {
  bankName: string;
  switchHealthPct: number; // 0 to 100
  latencyMs: number;
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN';
}

export interface AiDiagnosis {
  rootCause: string;
  confidenceScore: number; // 0 to 100
  proposedAction: string;
  suggestedDelayMinutes: number;
}

export interface Transaction {
  id: string;
  timestamp: string;
  amount: number;
  currency: string; // 'INR' | 'USD' | 'EUR'
  paymentRail: PaymentRail;
  errorCode: ErrorCode;
  errorMessage: string;
  bankTelemetry: BankTelemetry;
  aiDiagnosis: AiDiagnosis;
  complianceResult?: GatekeeperResult;
  status: 'FAILED' | 'RECOVERING' | 'RECOVERED' | 'FAILED_PERMANENTLY' | 'SUSPENDED';
  customerId: string;
  customerName: string;
  retryCount: number;
  maxRetriesAllowed: number;
}
