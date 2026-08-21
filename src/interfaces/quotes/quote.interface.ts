import mongoose from "mongoose";
import { UserRole } from "../../models/user.js";

export const QUOTE_STATUS = {
    Pending: "pending",
    Quoted: "quoted",
    Confirmed: "confirmed",
    Rejected: "rejected",
    Completed: "completed",
    Cancelled: "cancelled"
} as const;

export const PAYMENT_METHOD = {
    Cash: "cash",
    Card: "card",
    Transfer: "transfer",
    Unpaid: "unpaid"
} as const;

export type QuoteStatus = (typeof QUOTE_STATUS)[keyof typeof QUOTE_STATUS];
export type PaymentMethod = (typeof PAYMENT_METHOD)[keyof typeof PAYMENT_METHOD];

// Allowed status transitions; terminal states map to an empty list.
export const QUOTE_STATUS_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    [QUOTE_STATUS.Pending]: [QUOTE_STATUS.Quoted, QUOTE_STATUS.Cancelled, QUOTE_STATUS.Rejected],
    [QUOTE_STATUS.Quoted]: [QUOTE_STATUS.Confirmed, QUOTE_STATUS.Rejected, QUOTE_STATUS.Cancelled],
    [QUOTE_STATUS.Confirmed]: [QUOTE_STATUS.Completed, QUOTE_STATUS.Cancelled],
    [QUOTE_STATUS.Rejected]: [],
    [QUOTE_STATUS.Completed]: [],
    [QUOTE_STATUS.Cancelled]: []
};

export interface IDeliveryAddress {
    street: string;
    unit?: string;
    city: string;
    zipCode: string;
    notes?: string;
}

export interface IQuoteComment {
    _id?: string;
    senderId: mongoose.Types.ObjectId | string;
    senderRole: UserRole;
    message: string;
    createdAt?: Date;
}

export interface IQuoteProduct {
    productId: mongoose.Types.ObjectId | string;
    quantity: number;
    priceAtQuote: number;
}

export interface IQuote {
    _id?: string;
    userId: mongoose.Types.ObjectId | string;
    status: QuoteStatus;
    requestedPeople: number;
    dietaryNotes?: string;
    products: IQuoteProduct[];
    deliveryAddress: IDeliveryAddress;
    deliveryDate: Date;
    initialPrice: number;
    deliveryFee: number;
    discount: number;
    finalPrice: number;
    paidAmount: number;
    paymentMethod: PaymentMethod;
    receiptNote?: string;
    validUntil?: Date;
    comments: IQuoteComment[];
    deletedAt?: Date | null;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface IStoredQuote extends IQuote {
    createdAt: Date;
    updatedAt: Date;
}

// Client-supplied product line; the price is always snapshotted server-side.
export interface IQuoteProductInput {
    productId: string;
    quantity: number;
}

export interface IQuoteCreateRequest {
    // Admins may create a quote on behalf of a customer; ignored for customers.
    userId?: string;
    requestedPeople: number;
    dietaryNotes?: string;
    products: IQuoteProductInput[];
    deliveryAddress: IDeliveryAddress;
    deliveryDate: Date | string;
    deliveryFee?: number;
}

export interface IQuoteUpdateRequest {
    status?: QuoteStatus;
    requestedPeople?: number;
    dietaryNotes?: string;
    products?: IQuoteProductInput[];
    deliveryAddress?: IDeliveryAddress;
    deliveryDate?: Date | string;
    deliveryFee?: number;
    discount?: number;
    paidAmount?: number;
    paymentMethod?: PaymentMethod;
    receiptNote?: string;
    validUntil?: Date | string;
}

export interface IQuoteCommentCreateRequest {
    message: string;
}

export interface IQuoteCommentUpdateRequest {
    message: string;
}
