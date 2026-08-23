import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import type {
    IMailMessage,
    IMailTransporter
} from "../../interfaces/email/index.js";
import type { IStoredQuote } from "../../interfaces/quotes/quote.interface.js";
import { EmailService } from "../email.service.js";

const originalFromEmail = process.env.FROM_EMAIL;
const originalAdminEmail = process.env.ADMIN_EMAIL;

beforeEach(() => {
    process.env.FROM_EMAIL = "Pizzeria <noreply@pizzeria.com>";
    process.env.ADMIN_EMAIL = "admin@pizzeria.com";
});

afterEach(() => {
    process.env.FROM_EMAIL = originalFromEmail;
    process.env.ADMIN_EMAIL = originalAdminEmail;
});

function buildQuote(overrides: Record<string, unknown> = {}): IStoredQuote {
    return {
        _id: "quote-123",
        userId: {
            _id: "user-1",
            name: "Mario",
            surname: "Rossi",
            email: "mario@example.com",
            telephoneNumber: "+391112223334"
        },
        status: "pending",
        requestedPeople: 25,
        products: [],
        deliveryAddress: { street: "Via Roma", city: "Rome", zipCode: "00100" },
        deliveryDate: new Date("2026-09-01T12:00:00.000Z"),
        initialPrice: 500,
        deliveryFee: 0,
        discount: 0,
        finalPrice: 500,
        paidAmount: 0,
        paymentMethod: "unpaid",
        comments: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides
    } as unknown as IStoredQuote;
}

function recordingTransporter(): {
    transporter: IMailTransporter;
    sent: IMailMessage[];
} {
    const sent: IMailMessage[] = [];
    const transporter: IMailTransporter = {
        sendMail: async (message) => {
            sent.push(message);
            return { messageId: `id-${sent.length}` };
        },
        verify: async () => true
    };
    return { transporter, sent };
}

test("sends customer and admin emails with the PDF attachment", async () => {
    const { transporter, sent } = recordingTransporter();
    const service = new EmailService(transporter);
    const pdfBuffer = Buffer.from("MOCK PDF");

    const result = await service.sendQuoteNotifications({
        quote: buildQuote(),
        pdfBuffer
    });

    assert.equal(result.customer.status, "fulfilled");
    assert.equal(result.admin.status, "fulfilled");
    assert.equal(sent.length, 2);

    const [customer, admin] = sent;
    assert.equal(customer?.to, "mario@example.com");
    assert.equal(customer?.subject, "Your Catering Quote Request - Pizzeria");
    assert.equal(customer?.attachments?.[0]?.filename, "Catering_Quote_quote-123.pdf");
    assert.equal(customer?.attachments?.[0]?.contentType, "application/pdf");
    assert.equal(customer?.attachments?.[0]?.content, pdfBuffer);

    assert.equal(admin?.to, "admin@pizzeria.com");
    assert.ok(admin?.subject.startsWith("[NEW QUOTE REQUEST] Mario Rossi"));
    assert.equal(admin?.attachments?.[0]?.content, pdfBuffer);
});

test("a failing customer email does not prevent the admin email", async () => {
    const sent: IMailMessage[] = [];
    const transporter: IMailTransporter = {
        sendMail: async (message) => {
            if (message.to === "mario@example.com") {
                throw new Error("SMTP timeout");
            }
            sent.push(message);
            return { messageId: "admin-id" };
        },
        verify: async () => true
    };

    const service = new EmailService(transporter);
    const result = await service.sendQuoteNotifications({
        quote: buildQuote(),
        pdfBuffer: Buffer.from("MOCK PDF")
    });

    assert.equal(result.customer.status, "rejected");
    assert.equal(result.admin.status, "fulfilled");
    // The admin email still went out despite the customer failure.
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "admin@pizzeria.com");
});

test("skips the admin email when ADMIN_EMAIL is not configured", async () => {
    delete process.env.ADMIN_EMAIL;
    const { transporter, sent } = recordingTransporter();
    const service = new EmailService(transporter);

    const result = await service.sendQuoteNotifications({
        quote: buildQuote(),
        pdfBuffer: Buffer.from("MOCK PDF")
    });

    assert.equal(result.customer.status, "fulfilled");
    assert.equal(result.admin.status, "fulfilled");
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.to, "mario@example.com");
});

test("throws when the quote owner is not populated", async () => {
    const { transporter } = recordingTransporter();
    const service = new EmailService(transporter);

    await assert.rejects(
        () =>
            service.sendQuoteNotifications({
                quote: buildQuote({ userId: "user-1" }),
                pdfBuffer: Buffer.from("MOCK PDF")
            }),
        /not populated/
    );
});
