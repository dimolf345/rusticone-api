import mongoose, { Schema, type HydratedDocument } from "mongoose";
import type { AdminUser, CustomerUser, StoredUser } from "../interfaces/user/index.js";

export const USER_ROLES = {
  Admin: "admin",
  Customer: "customer"
} as const;

export const AUTH_PROVIDERS = {
  Google: "google"
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

export type User = AdminUser | CustomerUser;

export type UserDocument = HydratedDocument<StoredUser>;

const userSchema = new Schema<StoredUser>(
  {
    role: {
      type: String,
      enum: Object.values(USER_ROLES),
      default: USER_ROLES.Customer,
      required: true
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      unique: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      required: true
    },
    authProviderUserId: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    avatarUrl: {
      type: String,
      trim: true
    },
    emailVerified: {
      type: Boolean,
      default: false,
      required: true
    },
    lastLoginAt: {
      type: Date
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export const UserModel = mongoose.models.User ?? mongoose.model<StoredUser>("User", userSchema);
