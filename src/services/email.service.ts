import { getMailer } from "../config/mailer.js";
import type {
    IEmailService,
    IMailMessage,
    IMailTransporter,
    IQuoteEmailCustomer,
    IQuoteEmailData,
    IQuoteNotificationInput,
    IQuoteNotificationResult
} from "../interfaces/email/index.js";
import type { IStoredQuote } from "../interfaces/quotes/quote.interface.js";
import { logger } from "../logger/index.js";
import { renderQuoteAdminEmail } from "../templates/quote-admin.template.js";
import { renderQuoteCustomerEmail } from "../templates/quote-customer.template.js";

/** Shape of the quote owner once `userId` has been populated. */
interface IPopulatedQuoteOwner {
    _id?: unknown;
    name?: string;
    surname?: string;
    email?: string;
    telephoneNumber?: string;
}

export class EmailService implements IEmailService {
    constructor(private readonly transporter: IMailTransporter = getMailer()) {}

    /**
     * Emails both the customer and the admin a summary of a newly created quote,
     * each with the generated PDF attached. Both messages are dispatched with
     * `Promise.allSettled` so a failure on one does not prevent the other.
     */
    async sendQuoteNotifications({
        quote,
        pdfBuffer
    }: IQuoteNotificationInput): Promise<IQuoteNotificationResult> {
        const data = this.buildEmailData(quote);
        const quoteId = data.quoteId;

        const attachment = {
            filename: `Catering_Quote_${quoteId}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf" as const
        };

        const fromEmail = process.env.FROM_EMAIL;
        const adminEmail = process.env.ADMIN_EMAIL;

        const customerMessage: IMailMessage = {
            from: fromEmail,
            to: data.customer.email,
            subject: "Your Catering Quote Request - Pizzeria",
            html: renderQuoteCustomerEmail(data),
            attachments: [attachment]
        };

        const adminMessage: IMailMessage | undefined = adminEmail
            ? {
                  from: fromEmail,
                  to: adminEmail,
                  subject: `[NEW QUOTE REQUEST] ${data.customer.name} - ${data.deliveryDate.toISOString()}`,
                  html: renderQuoteAdminEmail(data),
                  attachments: [attachment]
              }
            : undefined;

        if (!adminMessage) {
            logger.warn(
                { quoteId },
                "ADMIN_EMAIL is not configured; skipping admin quote notification"
            );
        }

        logger.info(
            { quoteId, customer: data.customer.email, admin: adminEmail },
            "Dispatching quote notification emails"
        );

        const [customer, admin] = await Promise.allSettled([
            this.dispatch(customerMessage, quoteId),
            adminMessage
                ? this.dispatch(adminMessage, quoteId)
                : Promise.resolve<undefined>(undefined)
        ]);

        return { customer, admin };
    }

    /** Sends a single message and logs any transport-level failure with context. */
    private async dispatch(message: IMailMessage, quoteId: string): Promise<unknown> {
        try {
            return await this.transporter.sendMail(message);
        } catch (error) {
            logger.error(
                { err: error, quoteId, recipient: message.to },
                "Failed to send quote notification email"
            );
            throw error;
        }
    }

    /** Normalizes a populated quote into the flat shape the templates consume. */
    private buildEmailData(quote: IStoredQuote): IQuoteEmailData {
        return {
            quoteId: String(quote._id),
            customer: this.resolveCustomer(quote),
            deliveryDate: new Date(quote.deliveryDate),
            requestedPeople: quote.requestedPeople,
            finalPrice: quote.finalPrice
        };
    }

    /** Extracts customer contact details from the populated `userId` field. */
    private resolveCustomer(quote: IStoredQuote): IQuoteEmailCustomer {
        const owner = quote.userId as unknown as IPopulatedQuoteOwner | string | null;

        if (!owner || typeof owner !== "object" || !owner.email) {
            throw new Error(
                `Quote ${String(quote._id)} owner is not populated; cannot build recipient`
            );
        }

        const fullName = [owner.name, owner.surname].filter(Boolean).join(" ").trim();

        return {
            name: fullName || owner.email,
            email: owner.email,
            telephoneNumber: owner.telephoneNumber
        };
    }
}
