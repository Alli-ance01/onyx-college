import { accountStatuses, accountTypes } from '@onyx/contracts';
import mongoose, { type InferSchemaType, type Model } from 'mongoose';

const { model, models, Schema } = mongoose;

const userSchema = new Schema(
  {
    username: { type: String, required: true, trim: true },
    normalizedUsername: { type: String, required: true, select: false },
    email: { type: String, trim: true },
    normalizedEmail: { type: String, select: false },
    phone: { type: String, trim: true },
    normalizedPhone: { type: String, select: false },
    passwordHash: { type: String, required: true, select: false },
    accountType: { type: String, enum: accountTypes, required: true },
    accountStatus: { type: String, enum: accountStatuses, required: true },
    roles: [{ type: Schema.Types.ObjectId, ref: 'Role', required: true }],
    mustChangePassword: { type: Boolean, required: true, default: false },
    failedLoginCount: { type: Number, required: true, default: 0, min: 0 },
    firstFailedLoginAt: { type: Date },
    lockedUntil: { type: Date },
    passwordChangedAt: { type: Date },
    lastLoginAt: { type: Date },
    bootstrapKey: { type: String, select: false },
  },
  {
    collection: 'users',
    timestamps: true,
    versionKey: 'version',
    toJSON: {
      transform: (_document, returned: Record<string, unknown>) => {
        delete returned.passwordHash;
        delete returned.normalizedUsername;
        delete returned.normalizedEmail;
        delete returned.normalizedPhone;
        delete returned.bootstrapKey;
        return returned;
      },
    },
  },
);

userSchema.index({ normalizedUsername: 1 }, { name: 'user_username_unique', unique: true });
userSchema.index(
  { normalizedEmail: 1 },
  {
    name: 'user_email_unique_when_present',
    unique: true,
    partialFilterExpression: { normalizedEmail: { $type: 'string' } },
  },
);
userSchema.index(
  { normalizedPhone: 1 },
  {
    name: 'user_phone_unique_when_present',
    unique: true,
    partialFilterExpression: { normalizedPhone: { $type: 'string' } },
  },
);
userSchema.index(
  { bootstrapKey: 1 },
  {
    name: 'user_bootstrap_key_unique_when_present',
    unique: true,
    partialFilterExpression: { bootstrapKey: { $type: 'string' } },
  },
);
userSchema.index({ accountStatus: 1, accountType: 1 }, { name: 'user_account_state' });
userSchema.index({ roles: 1, accountStatus: 1 }, { name: 'user_role_state' });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const UserModel =
  (models.User as Model<UserDocument> | undefined) ?? model<UserDocument>('User', userSchema);
