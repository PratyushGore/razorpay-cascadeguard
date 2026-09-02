export type Jurisdiction = 'IN_RBI' | 'US_NACHA' | 'EU_PSD3';

export interface ComplianceRule {
  id: string;
  name: string;
  description: string;
  jurisdiction: Jurisdiction;
  legalReference?: string;
}

export interface GatekeeperResult {
  status: 'PASSED_CLEAN' | 'OVERRIDDEN' | 'HALTED';
  ruleViolated?: string;
  sanitizedAction?: string;
  overrideReason?: string;
  coolingPeriodHours?: number;
  complianceStamp?: string; // e.g. [STAMP: RBI_MANDATE_SEC_4C]
}
