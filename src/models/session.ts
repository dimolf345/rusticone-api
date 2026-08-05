import mongoose, { Schema, type HydratedDocument } from "mongoose";

export interface Session {
  userId: mongoose.Types.ObjectId;
  refreshToken: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  expiresAt: Date;
}

export type SessionDocument = HydratedDocument<Session>;

const sessionSchema = new Schema<Session>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true
    },
    userAgent: String,
    ipAddress: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true,
      expires: 0
    }
  },
  {
    versionKey: false
  }
);

export const SessionModel =
  mongoose.models.Session ?? mongoose.model<Session>("Session", sessionSchema);
