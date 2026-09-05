import mongoose, { Schema, type Model } from "mongoose";

import {
    IStoredQuote,
    PAYMENT_METHOD,
    QUOTE_STATUS
} from "../interfaces/quotes/quote.interface.js";
import { USER_ROLES } from "./user.js";
import { renameMongoId } from "../utils/mongoose.js";

const commentSchema = new Schema(
    {
        senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        senderRole: { type: String, enum: Object.values(USER_ROLES), required: true },
        message: { type: String, required: true, trim: true },
        createdAt: { type: Date, default: Date.now }
    },
    { _id: true }
);

const quoteProductSchema = new Schema(
    {
        productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        quantity: { type: Number, required: true, min: 1 },
        // Price snapshot locked at quote creation to prevent tampering.
        priceAtQuote: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const quoteSchema = new Schema<IStoredQuote>(
    {
        userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        status: {
            type: String,
            enum: Object.values(QUOTE_STATUS),
            default: QUOTE_STATUS.Pending,
            index: true
        },
        requestedPeople: { type: Number, required: true, min: 1 },
        dietaryNotes: { type: String, default: "" },
        products: { type: [quoteProductSchema], required: true },
        deliveryAddress: {
            street: { type: String, required: true },
            unit: { type: String, default: "" },
            city: { type: String, required: true },
            zipCode: { type: String, required: true },
            notes: { type: String, default: "" }
        },
        deliveryDate: { type: Date, required: true, index: true },
        initialPrice: { type: Number, required: true, min: 0 },
        deliveryFee: { type: Number, default: 0, min: 0 },
        discount: { type: Number, default: 0, min: 0 },
        finalPrice: { type: Number, required: true, min: 0 },
        paidAmount: { type: Number, default: 0, min: 0 },
        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHOD),
            default: PAYMENT_METHOD.Unpaid
        },
        receiptNote: { type: String, default: "" },
        validUntil: { type: Date },
        comments: { type: [commentSchema], default: [] },
        // Soft-delete marker; excluded from every read path.
        deletedAt: { type: Date, default: null, index: true }
    },
    {
        timestamps: true,
        versionKey: false,
        toJSON: { transform: renameMongoId }
    }
);

type QuoteModelType = Model<IStoredQuote>;

export const QuoteModel =
    (mongoose.models.Quote as QuoteModelType | undefined) ??
    mongoose.model<IStoredQuote, QuoteModelType>("Quote", quoteSchema);
