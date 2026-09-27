import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

const roleSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    displayName: { type: String, required: true },
    permissionIds: [{ type: Schema.Types.ObjectId, ref: 'Permission', required: true }],
    protected: { type: Boolean, required: true, default: false },
    systemManaged: { type: Boolean, required: true, default: false },
    status: { type: String, enum: ['ACTIVE', 'RETIRED'], required: true, default: 'ACTIVE' },
  },
  { collection: 'roles', timestamps: true, versionKey: 'version' },
);

roleSchema.index({ code: 1 }, { name: 'role_code_unique', unique: true });
roleSchema.index({ status: 1 }, { name: 'role_status' });

export type RoleDocument = InferSchemaType<typeof roleSchema>;
export const RoleModel =
  (models.Role as Model<RoleDocument> | undefined) ?? model<RoleDocument>('Role', roleSchema);
