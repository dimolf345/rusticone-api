import type { IQuoteEmailData } from "../interfaces/email/index.js";
import { escapeHtml, formatCurrency, formatDate } from "./format.js";

/**
 * Renders the HTML body for the internal admin notification email: a compact
 * operational breakdown of the new quote request.
 */
export function renderQuoteAdminEmail(data: IQuoteEmailData): string {
    const rows: Array<[string, string]> = [
        ["Customer", data.customer.name || "—"],
        ["Email", data.customer.email],
        ["Phone", data.customer.telephoneNumber || "—"],
        ["Event date", formatDate(data.deliveryDate)],
        ["Guests", String(data.requestedPeople)],
        ["Estimated total", formatCurrency(data.finalPrice)]
    ];

    const tableRows = rows
        .map(
            ([label, value]) =>
                `<tr>
                  <td style="padding:8px 12px;font-size:14px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${escapeHtml(label)}</td>
                  <td style="padding:8px 12px;font-size:14px;font-weight:bold;border-bottom:1px solid #e5e7eb;">${escapeHtml(value)}</td>
                </tr>`
        )
        .join("");

    return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="background-color:#111827;padding:20px 32px;color:#ffffff;font-size:18px;font-weight:bold;">
                New quote request
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <p style="margin:0 0 16px;font-size:15px;">A new catering quote has been submitted.</p>
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
                  ${tableRows}
                </table>
                <p style="margin:20px 0 0;font-size:14px;line-height:1.5;">
                  The full quote summary PDF is attached for reference.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color:#f9fafb;padding:16px 32px;font-size:12px;color:#9ca3af;">
                Quote reference ${escapeHtml(data.quoteId)}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
