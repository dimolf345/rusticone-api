import assert from "node:assert/strict";
import { test } from "node:test";
import type { Model } from "mongoose";

import type { IStoredProduct } from "../../interfaces/products/product.interface.js";
import { QUOTE_STATUS } from "../../interfaces/quotes/quote.interface.js";
import type { IStoredQuote } from "../../interfaces/quotes/quote.interface.js";
import { QuoteService } from "../quote.service.js";

function buildProductModel(products: Array<{ _id: string; basePrice: number }>) {
    return {
        find: () => ({
            lean: () => ({
                exec: async () => products
            })
        })
    } as unknown as Model<IStoredProduct>;
}

test("QuoteService.createOne snapshots product prices and computes totals", async () => {
    let createdDoc: Record<string, unknown> = {};
    const model = {
        create: async (doc: Record<string, unknown>) => {
            createdDoc = doc;
            return { toObject: () => ({ _id: "quote-1", ...doc }) };
        }
    } as unknown as Model<IStoredQuote>;
    const productModel = buildProductModel([
        { _id: "p1", basePrice: 10 },
        { _id: "p2", basePrice: 5 }
    ]);

    const service = new QuoteService(model, productModel);
    const quote = await service.createOne({
        userId: "user-1",
        requestedPeople: 4,
        products: [
            { productId: "p1", quantity: 2 },
            { productId: "p2", quantity: 1 }
        ],
        deliveryAddress: { street: "Main", city: "Rome", zipCode: "00100" },
        deliveryDate: new Date("2026-09-01T12:00:00.000Z"),
        deliveryFee: 3
    });

    // productsTotal = 10*2 + 5*1 = 25; initial = 25 + 3 = 28; final = 28 (no discount).
    assert.equal(createdDoc.initialPrice, 28);
    assert.equal(createdDoc.finalPrice, 28);
    const products = createdDoc.products as Array<{ priceAtQuote: number }>;
    assert.equal(products[0]?.priceAtQuote, 10);
    assert.equal(products[1]?.priceAtQuote, 5);
    assert.ok(createdDoc.validUntil instanceof Date);
    assert.equal(quote._id, "quote-1");
});

test("QuoteService.createOne rejects an unknown product id", async () => {
    const model = {
        create: async () => ({ toObject: () => ({}) })
    } as unknown as Model<IStoredQuote>;
    const service = new QuoteService(model, buildProductModel([]));

    await assert.rejects(
        () =>
            service.createOne({
                userId: "user-1",
                requestedPeople: 2,
                products: [{ productId: "missing", quantity: 1 }],
                deliveryAddress: { street: "Main", city: "Rome", zipCode: "00100" },
                deliveryDate: new Date()
            }),
        /does not exist/
    );
});

test("QuoteService.delete performs a soft delete", async () => {
    let capturedFilter: Record<string, unknown> = {};
    let capturedUpdate: Record<string, unknown> = {};
    const model = {
        findOneAndUpdate: (
            filter: Record<string, unknown>,
            update: Record<string, unknown>
        ) => {
            capturedFilter = filter;
            capturedUpdate = update;
            return { exec: async () => ({ _id: "quote-1", ...update }) };
        }
    } as unknown as Model<IStoredQuote>;

    const service = new QuoteService(model, buildProductModel([]));
    const deleted = await service.delete("quote-1");

    assert.equal(capturedFilter.deletedAt, null);
    assert.ok(capturedUpdate.deletedAt instanceof Date);
    assert.ok(deleted);
});

test("QuoteService.canTransition enforces the status workflow", () => {
    assert.equal(QuoteService.canTransition(QUOTE_STATUS.Pending, QUOTE_STATUS.Quoted), true);
    assert.equal(
        QuoteService.canTransition(QUOTE_STATUS.Quoted, QUOTE_STATUS.Confirmed),
        true
    );
    assert.equal(
        QuoteService.canTransition(QUOTE_STATUS.Confirmed, QUOTE_STATUS.Pending),
        false
    );
    assert.equal(
        QuoteService.canTransition(QUOTE_STATUS.Completed, QUOTE_STATUS.Cancelled),
        false
    );
    // Same-status updates are always allowed.
    assert.equal(
        QuoteService.canTransition(QUOTE_STATUS.Pending, QUOTE_STATUS.Pending),
        true
    );
});
