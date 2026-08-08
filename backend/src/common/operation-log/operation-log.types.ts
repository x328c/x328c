export interface OperationActorContext {
  adminId: bigint;
  requestId: string;
  ipAddress?: string;
}

export interface AppendOperationLogInput extends OperationActorContext {
  action: string;
  objectType: string;
  objectId: string;
  reason: string;
  beforeSummary?: Record<string, unknown>;
  afterSummary?: Record<string, unknown>;
}
