import bcrypt from "bcryptjs";
import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export const USER_ROLES = {
  Admin: "admin",
  Customer: "customer"
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export interface BaseUser {
  role: UserRole;
  email: string;
  name: string;
}

export interface AdminUser extends BaseUser {
  role: typeof USER_ROLES.Admin;
  username: string;
}

export interface CustomerUser extends BaseUser {
  role: typeof USER_ROLES.Customer;
  surname: string;
  deliveryAddress: string;
  telephoneNumber: string;
  fiscalCode?: string;
  dateOfBirth?: Date;
}

export type User = AdminUser | CustomerUser;

export const AUTH_PROVIDERS = {
  Local: "local",
  Google: "google"
} as const;

export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

export interface StoredUser {
  role: UserRole;
  email: string;
  password?: string;
  name?: string;
  authProvider: AuthProvider;
  googleId?: string | null;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface UserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

type UserModelType = Model<StoredUser, object, UserMethods>;
export type UserDocument = HydratedDocument<StoredUser, UserMethods>;

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
    name: {
      type: String,
      trim: true
    },
    authProvider: {
      type: String,
      enum: Object.values(AUTH_PROVIDERS),
      default: AUTH_PROVIDERS.Local,
      required: true
    },
    googleId: {
      type: String,
      default: null
    },
    lastLoginAt: Date
  },
  {
    timestamps: true,
    versionKey: false
  }
);

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function (
  candidatePassword: string
) {
  const password = this.password;

  if (!password) {
    return false;
  }

  return bcrypt.compare(candidatePassword, password);
};

export const UserModel =
  (mongoose.models.User as UserModelType | undefined) ??
  mongoose.model<StoredUser, UserModelType>("User", userSchema);
