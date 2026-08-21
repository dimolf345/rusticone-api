import type { HydratedDocument, Model } from "mongoose";

import { BadRequestError } from "../errors/index.js";
import type {
    IBaseServiceInterface,
    IFindAllOptions,
    IPaginatedResult
} from "../interfaces/base.interface.js";
import type { IStoredProduct } from "../interfaces/products/product.interface.js";
import {
    IQuoteComment,
    IQuoteCreateRequest,
    IQuoteProduct,
    IQuoteProductInput,
    IQuoteUpdateRequest,
    IStoredQuote,
    QUOTE_STATUS_TRANSITIONS,
    QuoteStatus
} from "../interfaces/quotes/quote.interface.js";
import { ProductModel } from "../models/product.js";
import { QuoteModel } from "../models/quote.js";
import {
    DEFAULT_LIMIT,
    DEFAULT_PAGE,
    MAX_LIMIT,
    normalizePositiveInteger
} from "../utils/pagination.js";

const QUOTE_VALIDITY_DAYS = 14;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export class QuoteService
    implements IBaseServiceInterface<IStoredQuote, IQuoteCreateRequest, IQuoteUpdateRequest>
{
    constructor(
        private readonly model: Model<IStoredQuote> = QuoteModel,
        private readonly productModel: Model<IStoredProduct> = ProductModel
    ) {}

    /** Returns whether a status change is allowed by the workflow map. */
    static canTransition(from: QuoteStatus, to: QuoteStatus): boolean {
        if (from === to) {
            return true;
        }

        return QUOTE_STATUS_TRANSITIONS[from]?.includes(to) ?? false;
    }

    async createOne(data: IQuoteCreateRequest): Promise<IStoredQuote> {
        const products = await this.buildQuoteProducts(data.products);
        const deliveryFee = data.deliveryFee ?? 0;
        const { initialPrice, finalPrice } = this.calcTotals(products, deliveryFee, 0);

        const created = await this.model.create({
            userId: data.userId,
            requestedPeople: data.requestedPeople,
            dietaryNotes: data.dietaryNotes,
            products,
            deliveryAddress: data.deliveryAddress,
            deliveryDate: data.deliveryDate,
            deliveryFee,
            initialPrice,
            finalPrice,
            validUntil: new Date(Date.now() + QUOTE_VALIDITY_DAYS * MS_PER_DAY)
        });

        return created.toObject() as IStoredQuote;
    }

    async findAll(
        options: IFindAllOptions<IStoredQuote> = {}
    ): Promise<IPaginatedResult<IStoredQuote>> {
        const page = normalizePositiveInteger(options.page, DEFAULT_PAGE);
        const limit = normalizePositiveInteger(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
        const filter = {
            ...options.filter,
            deletedAt: null
        } as never;
        const skip = (page - 1) * limit;

        const [data, total] = await Promise.all([
            this.model
                .find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .populate("userId")
                .populate("products.productId")
                .exec(),
            this.model.countDocuments(filter).exec()
        ]);

        return {
            data: data as unknown as IStoredQuote[],
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        };
    }

    async findOne(id: string): Promise<IStoredQuote | null> {
        return this.model
            .findOne({ _id: id, deletedAt: null })
            .populate("userId")
            .populate("products.productId")
            .exec() as unknown as Promise<IStoredQuote | null>;
    }

    /** Raw, unpopulated lookup used for authorization checks. */
    async findById(id: string): Promise<IStoredQuote | null> {
        return this.model
            .findOne({ _id: id, deletedAt: null })
            .exec() as unknown as Promise<IStoredQuote | null>;
    }

    async update(id: string, data: IQuoteUpdateRequest): Promise<IStoredQuote | null> {
        const quote = await this.model.findOne({ _id: id, deletedAt: null }).exec();

        if (!quote) {
            return null;
        }

        if (data.products) {
            quote.products = (await this.buildQuoteProducts(
                data.products
            )) as unknown as HydratedDocument<IStoredQuote>["products"];
        }
        if (data.requestedPeople !== undefined) quote.requestedPeople = data.requestedPeople;
        if (data.dietaryNotes !== undefined) quote.dietaryNotes = data.dietaryNotes;
        if (data.deliveryAddress !== undefined) {
            quote.deliveryAddress = data.deliveryAddress;
        }
        if (data.deliveryDate !== undefined) quote.deliveryDate = new Date(data.deliveryDate);
        if (data.deliveryFee !== undefined) quote.deliveryFee = data.deliveryFee;
        if (data.discount !== undefined) quote.discount = data.discount;
        if (data.paidAmount !== undefined) quote.paidAmount = data.paidAmount;
        if (data.paymentMethod !== undefined) quote.paymentMethod = data.paymentMethod;
        if (data.receiptNote !== undefined) quote.receiptNote = data.receiptNote;
        if (data.validUntil !== undefined) quote.validUntil = new Date(data.validUntil);
        if (data.status !== undefined) quote.status = data.status;

        const { initialPrice, finalPrice } = this.calcTotals(
            quote.products as unknown as IQuoteProduct[],
            quote.deliveryFee,
            quote.discount
        );
        quote.initialPrice = initialPrice;
        quote.finalPrice = finalPrice;

        await quote.save();

        return this.findOne(id);
    }

    /** Soft-deletes a quote by stamping deletedAt; the document is retained. */
    async delete(id: string): Promise<IStoredQuote | null> {
        return this.model
            .findOneAndUpdate(
                { _id: id, deletedAt: null },
                { deletedAt: new Date() },
                { returnDocument: "after" }
            )
            .exec() as unknown as Promise<IStoredQuote | null>;
    }

    async addComment(id: string, comment: IQuoteComment): Promise<IStoredQuote | null> {
        const updated = await this.model
            .findOneAndUpdate(
                { _id: id, deletedAt: null },
                { $push: { comments: comment } },
                { returnDocument: "after" }
            )
            .exec();

        if (!updated) {
            return null;
        }

        return this.findOne(id);
    }

    /** Edits the message of an existing comment identified by its subdocument id. */
    async updateComment(
        id: string,
        commentId: string,
        message: string
    ): Promise<IStoredQuote | null> {
        const updated = await this.model
            .findOneAndUpdate(
                { _id: id, deletedAt: null, "comments._id": commentId },
                { $set: { "comments.$.message": message } },
                { returnDocument: "after" }
            )
            .exec();

        if (!updated) {
            return null;
        }

        return this.findOne(id);
    }

    /** Fetches current product prices and snapshots them onto quote lines. */
    private async buildQuoteProducts(
        inputs: IQuoteProductInput[]
    ): Promise<IQuoteProduct[]> {
        if (!Array.isArray(inputs) || inputs.length === 0) {
            throw new BadRequestError("A quote must contain at least one product");
        }

        const ids = inputs.map((input) => input.productId);
        const products = await this.productModel
            .find({ _id: { $in: ids } })
            .lean()
            .exec();
        const priceById = new Map(
            products.map((product) => [String(product._id), product.basePrice])
        );

        return inputs.map((input) => {
            const basePrice = priceById.get(String(input.productId));

            if (basePrice === undefined) {
                throw new BadRequestError(
                    `Product ${String(input.productId)} does not exist`
                );
            }

            if (!Number.isFinite(input.quantity) || input.quantity < 1) {
                throw new BadRequestError("Product quantity must be at least 1");
            }

            return {
                productId: input.productId,
                quantity: input.quantity,
                priceAtQuote: basePrice
            };
        });
    }

    private calcTotals(
        products: IQuoteProduct[],
        deliveryFee: number,
        discount: number
    ): { initialPrice: number; finalPrice: number } {
        const productsTotal = products.reduce(
            (sum, product) => sum + product.priceAtQuote * product.quantity,
            0
        );
        const initialPrice = productsTotal + deliveryFee;
        const finalPrice = Math.max(0, initialPrice - discount);

        return { initialPrice, finalPrice };
    }
}
