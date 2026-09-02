export type AuditStage = 'INGESTED' | 'DIAGNOSED' | 'GATED' | 'DISPATCHED';

export interface AuditEntry {
  id: string; // Sha-256 block hash or random string
  timestamp: string;
  txId: string;
  stage: AuditStage;
  complianceStamp?: string;
  blockHash: string; // Cryptographic hash
  details?: string;
}
