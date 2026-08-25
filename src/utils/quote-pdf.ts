import type { IStoredQuote } from "../interfaces/quotes/quote.interface.js";

/**
 * Produces the quote summary PDF as an in-memory Buffer.
 *
 * This is currently a placeholder that returns a stub buffer so the email
 * notification flow can attach a document. Replace the body with a real PDF
 * generator (e.g. pdfkit) when the document layout is defined; the signature is
 * intentionally stable so callers do not change.
 */
export function generateQuotePdf(quote: IStoredQuote): Buffer {
    return Buffer.from(`MOCK PDF CONTENT for quote ${String(quote._id)}`);
}
