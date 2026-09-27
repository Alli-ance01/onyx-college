import { model, models, Schema, type InferSchemaType, type Model } from 'mongoose';

const permissionSchema = new Schema(
  {
    code: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    domain: { type: String, required: true },
    sensitivity: {
      type: String,
      enum: ['STANDARD', 'SENSITIVE', 'PRIVILEGED'],
      required: true,
    },
    status: { type: String, enum: ['ACTIVE', 'RETIRED'], required: true, default: 'ACTIVE' },
    systemManaged: { type: Boolean, required: true, default: true },
  },
  { collection: 'permissions', timestamps: true, versionKey: 'version' },
);

permissionSchema.index({ code: 1 }, { name: 'permission_code_unique', unique: true });
permissionSchema.index({ domain: 1, status: 1 }, { name: 'permission_domain_status' });

export type PermissionDocument = InferSchemaType<typeof permissionSchema>;
export const PermissionModel =
  (models.Permission as Model<PermissionDocument> | undefined) ??
  model<PermissionDocument>('Permission', permissionSchema);
