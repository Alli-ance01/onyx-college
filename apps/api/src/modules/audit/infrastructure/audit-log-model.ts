import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { model, models, Schema } = mongoose;

const auditLogSchema = new Schema(
  {
    actorType: { type: String, enum: ['SYSTEM', 'USER'], required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorSessionId: { type: String },
    action: { type: String, required: true },
    targetType: { type: String, required: true },
    targetId: { type: String, required: true },
    outcome: { type: String, enum: ['SUCCESS', 'DENIED', 'FAILURE'], required: true },
    changes: { type: Schema.Types.Mixed },
    reason: { type: String },
    requestId: { type: String },
    correlationId: { type: String },
    sourceContext: { type: Schema.Types.Mixed },
    occurredAt: { type: Date, required: true, default: Date.now, immutable: true },
  },
  {
    collection: 'audit_logs',
    timestamps: false,
    versionKey: false,
  },
);

auditLogSchema.index({ actorUserId: 1, occurredAt: -1 }, { name: 'audit_actor_time' });
auditLogSchema.index({ targetType: 1, targetId: 1, occurredAt: -1 }, { name: 'audit_target_time' });
auditLogSchema.index({ action: 1, occurredAt: -1 }, { name: 'audit_action_time' });
auditLogSchema.index({ requestId: 1 }, { name: 'audit_request_id', sparse: true });
auditLogSchema.index({ correlationId: 1 }, { name: 'audit_correlation_id', sparse: true });

export type AuditLogDocument = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel =
  (models.AuditLog as Model<AuditLogDocument> | undefined) ??
  model<AuditLogDocument>('AuditLog', auditLogSchema);
