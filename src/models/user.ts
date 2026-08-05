import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import type { AdminUser, CustomerUser, StoredUser } from "../interfaces/user/index.js";
import bcrypt from "bcryptjs";

export const USER_ROLES = {
  Admin: "admin",
  Customer: "customer"
} as const;


export const AUTH_PROVIDERS = {
  Local: "local",
  Google: "google"
} as const;


interface UserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

type UserModelType = Model<StoredUser, object, UserMethods>;
export type UserDocument = HydratedDocument<StoredUser, UserMethods>;


export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export type User = AdminUser | CustomerUser;

const userSchema = new Schema<StoredUser, UserModelType, UserMethods>(
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
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      select: false,
      required(this: StoredUser) {
        return this.authProvider === AUTH_PROVIDERS.Local;
      }
    },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      required: true,
      default: AUTH_PROVIDERS.Local,
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
    },
    googleId: {
      type: String,
      default: null
    },
  } as unknown as StoredUser,
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.pre("save", async function (this: UserDocument) {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (
  this: UserDocument,
  candidatePassword: string
) {
  const password = this.password as string | undefined;

  if (!password) {
    return false;
  }

  return bcrypt.compare(candidatePassword, password);
};

export const UserModel =
  (mongoose.models.User as UserModelType | undefined) ??
  mongoose.model<StoredUser, UserModelType>("User", userSchema);
