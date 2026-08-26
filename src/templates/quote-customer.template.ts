import type { IQuoteEmailData } from "../interfaces/email/index.js";
import { escapeHtml, formatCurrency, formatDate } from "./format.js";

/**
 * Renders the responsive HTML body for the customer acknowledgement email.
 * All interpolated values are HTML-escaped to keep the template injection-safe.
 */
export function renderQuoteCustomerEmail(data: IQuoteEmailData): string {
    const customerName = escapeHtml(data.customer.name || "there");
    const deliveryDate = escapeHtml(formatDate(data.deliveryDate));
    const total = escapeHtml(formatCurrency(data.finalPrice));

    return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#b91c1c;padding:24px 32px;color:#ffffff;font-size:20px;font-weight:bold;">
                Pizzeria Catering
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px;font-size:16px;">Hi ${customerName},</p>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.5;">
                  Thank you for your catering quote request! We have received your
                  details and our team will be in touch shortly.
                </p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;">
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Event date</td>
                    <td style="padding:8px 0;font-size:14px;text-align:right;font-weight:bold;">${deliveryDate}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Number of guests</td>
                    <td style="padding:8px 0;font-size:14px;text-align:right;font-weight:bold;">${data.requestedPeople}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;font-size:14px;color:#6b7280;">Estimated total</td>
                    <td style="padding:8px 0;font-size:14px;text-align:right;font-weight:bold;">${total}</td>
                  </tr>
                </table>
                <p style="margin:16px 0 0;font-size:15px;line-height:1.5;">
                  A summary of your quote is attached to this email as a PDF document.
                </p>
                <p style="margin:24px 0 0;font-size:15px;">Warm regards,<br />The Pizzeria Catering Team</p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb;padding:16px 32px;font-size:12px;color:#9ca3af;">
                This is an automated message regarding quote ${escapeHtml(data.quoteId)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
