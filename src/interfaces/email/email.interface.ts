import type { IStoredQuote } from "../quotes/quote.interface.js";

/** A single email attachment, shaped to match Nodemailer's attachment API. */
export interface IMailAttachment {
    filename: string;
    content: Buffer;
    contentType: string;
}

/** The minimal message payload the email service hands to the transporter. */
export interface IMailMessage {
    from?: string;
    to: string;
    subject: string;
    html: string;
    attachments?: IMailAttachment[];
}

/**
 * The subset of the Nodemailer transporter surface the app relies on. Declaring
 * it explicitly keeps the service testable with a lightweight fake transporter.
 */
export interface IMailTransporter {
    sendMail(message: IMailMessage): Promise<unknown>;
    verify(): Promise<true>;
}

/** Customer contact details resolved from the quote owner. */
export interface IQuoteEmailCustomer {
    name: string;
    email: string;
    telephoneNumber?: string;
}

/** Normalized data extracted from a quote for rendering email templates. */
export interface IQuoteEmailData {
    quoteId: string;
    customer: IQuoteEmailCustomer;
    deliveryDate: Date;
    requestedPeople: number;
    finalPrice: number;
}

/** Input accepted by {@link IEmailService.sendQuoteNotifications}. */
export interface IQuoteNotificationInput {
    /** The stored quote with its `userId` populated to the owning customer. */
    quote: IStoredQuote;
    /** The generated quote summary PDF to attach to both emails. */
    pdfBuffer: Buffer;
}

/** Per-recipient outcome of a quote notification dispatch. */
export interface IQuoteNotificationResult {
    customer: PromiseSettledResult<unknown>;
    admin: PromiseSettledResult<unknown>;
}

export interface IEmailService {
    sendQuoteNotifications(
        input: IQuoteNotificationInput
    ): Promise<IQuoteNotificationResult>;
}
