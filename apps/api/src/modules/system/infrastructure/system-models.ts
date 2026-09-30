import mongoose, { type Model, type Types } from 'mongoose';

const { model, models, Schema } = mongoose;

export interface SequenceCounterRecord {
  key: string;
  value: number;
}

const sequenceCounterSchema = new Schema<SequenceCounterRecord>(
  {
    key: { type: String, required: true, immutable: true },
    value: { type: Number, required: true, min: 0 },
  },
  { collection: 'sequence_counters', timestamps: true, versionKey: false },
);
sequenceCounterSchema.index({ key: 1 }, { name: 'sequence_counter_key_unique', unique: true });

export interface OutboxEventRecord {
  aggregateId: string;
  aggregateType: string;
  eventId: string;
  eventType: string;
  occurredAt: Date;
  payload: Record<string, unknown>;
  status: 'PENDING';
  transactionActorId?: Types.ObjectId;
}

const outboxEventSchema = new Schema<OutboxEventRecord>(
  {
    eventId: { type: String, required: true, immutable: true },
    eventType: { type: String, required: true, immutable: true },
    aggregateType: { type: String, required: true, immutable: true },
    aggregateId: { type: String, required: true, immutable: true },
    transactionActorId: { type: Schema.Types.ObjectId, ref: 'User', immutable: true },
    occurredAt: { type: Date, required: true, immutable: true },
    payload: { type: Schema.Types.Mixed, required: true, immutable: true },
    status: { type: String, enum: ['PENDING'], required: true, default: 'PENDING' },
  },
  { collection: 'outbox_events', timestamps: false, versionKey: false },
);
outboxEventSchema.index({ eventId: 1 }, { name: 'outbox_event_id_unique', unique: true });
outboxEventSchema.index({ status: 1, occurredAt: 1 }, { name: 'outbox_pending_time' });

export const SequenceCounterModel =
  (models.SequenceCounter as Model<SequenceCounterRecord> | undefined) ??
  model<SequenceCounterRecord>('SequenceCounter', sequenceCounterSchema);
export const OutboxEventModel =
  (models.OutboxEvent as Model<OutboxEventRecord> | undefined) ??
  model<OutboxEventRecord>('OutboxEvent', outboxEventSchema);
