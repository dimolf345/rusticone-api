import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import type { IAdminUser, ICustomerUser, IStoredUser } from "../interfaces/user/index.js";
import bcrypt from "bcryptjs";
import { renameMongoId } from "../utils/mongoose.js";

export const USER_ROLES = {
  Admin: "admin",
  Customer: "customer"
} as const;


export const AUTH_PROVIDERS = {
  Local: "local",
  Google: "google"
} as const;

export const BASIC_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


interface IUserMethods {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

type UserModelType = Model<IStoredUser, object, IUserMethods>;
export type UserDocument = HydratedDocument<IStoredUser, IUserMethods>;


export type AuthProvider = (typeof AUTH_PROVIDERS)[keyof typeof AUTH_PROVIDERS];

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export type User = IAdminUser | ICustomerUser;

const userSchema = new Schema<IStoredUser, UserModelType, IUserMethods>(
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
      lowercase: true,
      unique: true,
      trim: true,
      match: [BASIC_EMAIL_PATTERN, "Please fill a valid email address."]
    },
    name: {
      type: String,
      required(this: IStoredUser) {
        return this.role === USER_ROLES.Customer;
      },
      unique: false,
      lowercase: false,
      trim: true
    },
    surname: {
      type: String,
      required: false,
      trim: true,
      unique: false
    },
    username: {
      type: String,
      required(this: IStoredUser) {
        return this.role === USER_ROLES.Admin;
      },
      trim: true,
      unique: true,
      lowercase: true
    },
    deliveryAddress: {
      type: String,
      required(this: IStoredUser) {
        return false;
        // return this.role === USER_ROLES.Customer;
      }
    },
    telephoneNumber: {
      type: String,
      required(this: IStoredUser) {
        return false;
        // return this.role === USER_ROLES.Customer;
      },
      match: /^\+?[1-9]\d{1,14}$/
    },
    fiscalCode: {
      type: String,
      required: false,
      uppercase: true,
      match: [/^[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]$/, 'Please provide a valid Italian Fiscal Code.']
    },
    dateOfBirth: {
      type: Date,
      max: [new Date(), 'Date of birth cannot be in the future'],
      min: [new Date('1900-01-01'), 'Date of birth is too old']
    },
    password: {
      type: String,
      select: false,
      required(this: IStoredUser) {
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
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: renameMongoId
    }
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
  mongoose.model<IStoredUser, UserModelType>("User", userSchema);
