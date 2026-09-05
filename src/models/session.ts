import mongoose, { Schema, type HydratedDocument } from "mongoose";
import { renameMongoId } from "../utils/mongoose.js";

export interface ISession {
  userId: mongoose.Types.ObjectId;
  refreshTokenHash: string;
  usedRefreshTokenHashes: string[];
  generation: number;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}

export type SessionDocument = HydratedDocument<ISession>;

const sessionSchema = new Schema<ISession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    refreshTokenHash: {
      type: String,
      required: true,
      unique: true
    },
    usedRefreshTokenHashes: {
      type: [String],
      default: []
    },
    generation: {
      type: Number,
      required: true,
      default: 0,
      min: 0
    },
    userAgent: String,
    ipAddress: {
      type: String,
      index: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0
    },
    revokedAt: Date
  },
  {
    versionKey: false,
    toJSON: { transform: renameMongoId }
  }
);

export const SessionModel =
  mongoose.models.Session ?? mongoose.model<ISession>("Session", sessionSchema);
