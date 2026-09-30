import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { model, models, Schema } = mongoose;

const authSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    familyId: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    currentTokenHash: { type: String, required: true, select: false },
    previousTokenHash: { type: String, select: false },
    previousTokenValidUntil: { type: Date, select: false },
    csrfNonce: { type: String, required: true, select: false },
    fingerprintHash: { type: String, required: true, select: false },
    deviceLabel: { type: String, required: true },
    ipHash: { type: String, required: true, select: false },
    status: { type: String, enum: ['ACTIVE', 'REVOKED'], required: true, default: 'ACTIVE' },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date },
    revocationReason: { type: String },
    replayDetectedAt: { type: Date },
    rotationCounter: { type: Number, required: true, default: 0, min: 0 },
  },
  { collection: 'auth_sessions', timestamps: true, versionKey: 'version' },
);

authSessionSchema.index({ sessionId: 1 }, { name: 'auth_session_id_unique', unique: true });
authSessionSchema.index(
  { currentTokenHash: 1 },
  { name: 'auth_session_current_hash_unique', unique: true },
);
authSessionSchema.index(
  { userId: 1, status: 1, expiresAt: 1 },
  { name: 'auth_session_user_active' },
);
authSessionSchema.index({ familyId: 1, status: 1 }, { name: 'auth_session_family' });
authSessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: 'auth_session_expiry_ttl' },
);

export type AuthSessionDocument = InferSchemaType<typeof authSessionSchema>;
export const AuthSessionModel =
  (models.AuthSession as Model<AuthSessionDocument> | undefined) ??
  model<AuthSessionDocument>('AuthSession', authSessionSchema);
