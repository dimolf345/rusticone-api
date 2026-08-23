# Email notifications

When a quote is created (`POST /api/quotes`), the API asynchronously emails both
the customer and the admin a summary of the request, each with the quote summary
PDF attached. Email delivery is **best-effort**: it never blocks or fails the
`201 Created` response.

## Configuration

SMTP credentials and addresses are read exclusively from environment variables.
Add the following to your `.env` (see [`.env.example`](../.env.example)):

| Variable     | Description                                                        |
| ------------ | ------------------------------------------------------------------ |
| `SMTP_HOST`  | SMTP server hostname                                               |
| `SMTP_PORT`  | SMTP server port (e.g. `587` for STARTTLS, `465` for implicit TLS) |
| `SMTP_USER`  | SMTP username                                                      |
| `SMTP_PASS`  | SMTP password                                                      |
| `FROM_EMAIL` | The `From` header, e.g. `"Pizzeria Catering <noreply@pizzeria.com>"` |
| `ADMIN_EMAIL`| Recipient of the internal new-quote notification                  |

If `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, and `SMTP_PASS` are not **all** set,
email notifications are disabled: the feature is skipped and a warning is logged.
This keeps local development and the test suite free of SMTP requirements. If
`ADMIN_EMAIL` is missing, only the customer email is sent.

## Architecture

| File                                        | Responsibility                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------- |
| `src/config/mailer.ts`                      | Lazily builds the reusable Nodemailer transporter; `verifyMailer()` checks SMTP health at boot; `isMailerConfigured()` gates dispatch. |
| `src/services/email.service.ts`             | `EmailService.sendQuoteNotifications({ quote, pdfBuffer })` builds and sends both messages. |
| `src/templates/quote-customer.template.ts`  | Renders the responsive customer acknowledgement HTML.                     |
| `src/templates/quote-admin.template.ts`     | Renders the internal admin notification HTML.                             |
| `src/templates/format.ts`                   | Shared HTML-escaping, currency, and date formatting helpers.              |
| `src/utils/quote-pdf.ts`                    | `generateQuotePdf(quote)` — currently returns a stub buffer (placeholder for a real PDF generator). |
| `src/controllers/quote.controller.ts`       | Triggers `notifyQuoteCreated` after the quote is saved, without awaiting it in the request path. |

The transporter and email service are injected via constructor defaults, so both
can be replaced with fakes in tests.

## Behavior

1. The customer is the quote owner; contact details are resolved from the
   populated `userId` (`name`, `surname`, `email`, `telephoneNumber`).
2. **Customer email** — subject `Your Catering Quote Request - Pizzeria`; body
   acknowledges the request and states the PDF is attached.
3. **Admin email** — subject `[NEW QUOTE REQUEST] <customer> - <eventDate>`; body
   is an operational breakdown (name, phone, email, guests, estimated total).
4. Both messages share the same attachment:
   `{ filename: "Catering_Quote_<quoteId>.pdf", content: pdfBuffer, contentType: "application/pdf" }`.
5. Emails are dispatched with `Promise.allSettled`, so a failure sending one does
   not prevent the other.

## Resilience

- The controller sends emails **after** responding `201 Created` and never
  awaits the dispatch in the request path, so SMTP latency or failures cannot
  turn a successfully saved quote into an HTTP error.
- All dispatch errors (SMTP timeouts, invalid recipients, connection failures)
  are caught and logged with context (`quoteId`, `recipient`, `error`).

## Logging

- Dispatch start is logged at `info` with `quoteId` and recipient addresses.
- Per-message failures are logged at `error` with `quoteId`, `recipient`, and the
  error.
- Missing SMTP or admin configuration is logged at `warn`.

## Testing

- Email construction, the `Promise.allSettled` isolation guarantee, the
  admin-skip path, and the unpopulated-owner guard are covered by
  [`src/services/__tests__/email.service.test.ts`](../src/services/__tests__/email.service.test.ts).
- Template rendering and HTML escaping are covered by
  [`src/templates/__tests__/quote-templates.test.ts`](../src/templates/__tests__/quote-templates.test.ts).
