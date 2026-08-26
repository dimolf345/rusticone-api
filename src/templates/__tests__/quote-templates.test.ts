import assert from "node:assert/strict";
import { test } from "node:test";

import type { IQuoteEmailData } from "../../interfaces/email/index.js";
import { renderQuoteAdminEmail } from "../quote-admin.template.js";
import { renderQuoteCustomerEmail } from "../quote-customer.template.js";

function buildData(overrides: Partial<IQuoteEmailData> = {}): IQuoteEmailData {
    return {
        quoteId: "quote-1",
        customer: {
            name: "Mario Rossi",
            email: "mario@example.com",
            telephoneNumber: "+391112223334"
        },
        deliveryDate: new Date("2026-09-01T12:00:00.000Z"),
        requestedPeople: 25,
        finalPrice: 500,
        ...overrides
    };
}

test("customer template includes key quote details", () => {
    const html = renderQuoteCustomerEmail(buildData());

    assert.match(html, /Mario Rossi/);
    assert.match(html, /01 September 2026/);
    assert.match(html, /25/);
    assert.match(html, /€500\.00/);
    assert.match(html, /attached/i);
});

test("admin template includes operational contact breakdown", () => {
    const html = renderQuoteAdminEmail(buildData());

    assert.match(html, /Mario Rossi/);
    assert.match(html, /mario@example\.com/);
    assert.match(html, /\+391112223334/);
    assert.match(html, /New quote request/);
});

test("templates escape HTML to prevent injection", () => {
    const html = renderQuoteCustomerEmail(
        buildData({
            customer: {
                name: "<script>alert(1)</script>",
                email: "x@example.com"
            }
        })
    );

    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
    assert.match(html, /&lt;script&gt;/);
});
