import type { Request, Response } from "express";
import mongoose from "mongoose";

import { BadRequestError, ForbiddenError, NotFoundError } from "../errors/index.js";
import type { IAuthenticatedRequest } from "../interfaces/auth/auth-request.interface.js";
import type { IAccessTokenPayload } from "../interfaces/auth/jwt.interface.js";
import type {
    EntityFilter,
    IBaseControllerInterface,
    IFindAllOptions
} from "../interfaces/base.interface.js";
import {
    IQuoteCommentCreateRequest,
    IQuoteCommentUpdateRequest,
    IQuoteCreateRequest,
    IQuoteUpdateRequest,
    IStoredQuote,
    QUOTE_STATUS
} from "../interfaces/quotes/quote.interface.js";
import { USER_ROLES, UserRole } from "../models/user.js";
import { QuoteService } from "../services/quote.service.js";
import {
    DEFAULT_LIMIT,
    DEFAULT_PAGE,
    MAX_LIMIT,
    parsePositiveInteger
} from "../utils/pagination.js";

// Fields a customer is allowed to change on their own quote.
const CUSTOMER_EDITABLE_FIELDS = [
    "requestedPeople",
    "dietaryNotes",
    "products",
    "deliveryAddress",
    "deliveryDate"
] as const;

export class QuotesController
    implements IBaseControllerInterface<IStoredQuote, IQuoteCreateRequest, IQuoteUpdateRequest>
{
    constructor(private readonly service: QuoteService = new QuoteService()) {}

    public createOne = async (
        request: Request<unknown, unknown, IQuoteCreateRequest>,
        response: Response
    ): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info("Creating quote");

        const payload: IQuoteCreateRequest = { ...request.body };

        // Customers can only create quotes for themselves; admins may target a user.
        if (authUser.role !== USER_ROLES.Admin || !payload.userId) {
            payload.userId = authUser.userId;
        }

        const quote = await this.service.createOne(payload);
        request.log.info({ quoteId: quote._id }, "Quote created");
        response.status(201).json(quote);
    };

    public findAll = async (request: Request, response: Response): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info("Finding all quotes");

        const options = this.createFindAllOptions(request.query, authUser);
        const result = await this.service.findAll(options);
        response.status(200).json(result);
    };

    public findOne = async (
        request: Request<{ id: string }>,
        response: Response
    ): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info(`Finding quote ${request.params.id}`);

        const quote = await this.service.findOne(request.params.id);

        if (!quote) {
            throw new NotFoundError("quote not found");
        }

        this.assertCanAccess(authUser, quote);
        response.status(200).json(quote);
    };

    public update = async (
        request: Request<{ id: string }, unknown, IQuoteUpdateRequest>,
        response: Response
    ): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info(`Updating quote ${request.params.id}`);

        const current = await this.service.findById(request.params.id);

        if (!current) {
            throw new NotFoundError("quote not found");
        }

        const isAdmin = authUser.role === USER_ROLES.Admin;

        if (!isAdmin) {
            if (this.resolveOwnerId(current) !== authUser.userId) {
                request.log.warn(
                    { quoteId: request.params.id, userId: authUser.userId },
                    "Customer attempted to edit another user's quote"
                );
                throw new ForbiddenError("You can only edit your own quotes");
            }

            if (current.status === QUOTE_STATUS.Confirmed) {
                throw new ForbiddenError("Confirmed quotes can no longer be edited");
            }

            const disallowed = Object.keys(request.body).filter(
                (key) =>
                    !CUSTOMER_EDITABLE_FIELDS.includes(
                        key as (typeof CUSTOMER_EDITABLE_FIELDS)[number]
                    )
            );

            if (disallowed.length > 0) {
                throw new ForbiddenError(
                    `Customers cannot modify: ${disallowed.join(", ")}`
                );
            }
        }

        if (
            request.body.status &&
            request.body.status !== current.status &&
            !QuoteService.canTransition(current.status, request.body.status)
        ) {
            throw new BadRequestError(
                `Cannot change status from ${current.status} to ${request.body.status}`
            );
        }

        const updated = await this.service.update(request.params.id, request.body);

        if (!updated) {
            throw new NotFoundError("quote not found");
        }

        response.status(200).json(updated);
    };

    public delete = async (
        request: Request<{ id: string }>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Deleting quote ${request.params.id}`);

        const deleted = await this.service.delete(request.params.id);

        if (!deleted) {
            throw new NotFoundError("quote not found");
        }

        response.status(204).send();
    };

    public addComment = async (
        request: Request<{ id: string }, unknown, IQuoteCommentCreateRequest>,
        response: Response
    ): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info(`Adding comment to quote ${request.params.id}`);

        const message = request.body?.message;

        if (typeof message !== "string" || message.trim() === "") {
            throw new BadRequestError("A comment message is required");
        }

        const current = await this.service.findById(request.params.id);

        if (!current) {
            throw new NotFoundError("quote not found");
        }

        this.assertCanAccess(authUser, current);

        const senderRole = authUser.role as UserRole;

        const updated = await this.service.addComment(request.params.id, {
            senderId: authUser.userId,
            senderRole,
            message: message.trim()
        });

        if (!updated) {
            throw new NotFoundError("quote not found");
        }

        response.status(201).json(updated);
    };

    public updateComment = async (
        request: Request<{ id: string; commentId: string }, unknown, IQuoteCommentUpdateRequest>,
        response: Response
    ): Promise<void> => {
        const authUser = this.requireUser(request);
        request.log.info(
            `Updating comment ${request.params.commentId} on quote ${request.params.id}`
        );

        const message = request.body?.message;

        if (typeof message !== "string" || message.trim() === "") {
            throw new BadRequestError("A comment message is required");
        }

        const current = await this.service.findById(request.params.id);

        if (!current) {
            throw new NotFoundError("quote not found");
        }

        this.assertCanAccess(authUser, current);

        const comment = current.comments.find(
            (entry) => String(entry._id) === request.params.commentId
        );

        if (!comment) {
            throw new NotFoundError("comment not found");
        }

        // Comments are immutable to everyone except their original author.
        if (String(comment.senderId) !== authUser.userId) {
            request.log.warn(
                {
                    quoteId: request.params.id,
                    commentId: request.params.commentId,
                    userId: authUser.userId
                },
                "User attempted to edit another user's comment"
            );
            throw new ForbiddenError("You can only edit your own comments");
        }

        const updated = await this.service.updateComment(
            request.params.id,
            request.params.commentId,
            message.trim()
        );

        if (!updated) {
            throw new NotFoundError("comment not found");
        }

        response.status(200).json(updated);
    };

    /**
     * Builds the list filter, forcing customers to only see their own quotes.
     */
    public createFindAllOptions(
        query: Request["query"],
        authUser: IAccessTokenPayload
    ): IFindAllOptions<IStoredQuote> {
        const filter: Record<string, unknown> = {};

        if (authUser.role === USER_ROLES.Customer) {
            filter.userId = authUser.userId;
        } else if (typeof query.userId === "string" && query.userId.trim() !== "") {
            filter.userId = query.userId;
        }

        if (
            typeof query.status === "string" &&
            (Object.values(QUOTE_STATUS) as string[]).includes(query.status)
        ) {
            filter.status = query.status;
        }

        const deliveryDate: Record<string, Date> = {};
        if (typeof query.startDate === "string") {
            const start = new Date(query.startDate);
            if (!Number.isNaN(start.getTime())) {
                deliveryDate.$gte = start;
            }
        }
        if (typeof query.endDate === "string") {
            const end = new Date(query.endDate);
            if (!Number.isNaN(end.getTime())) {
                deliveryDate.$lte = end;
            }
        }
        if (Object.keys(deliveryDate).length > 0) {
            filter.deliveryDate = deliveryDate;
        }

        return {
            filter: filter as EntityFilter<IStoredQuote>,
            page: parsePositiveInteger(query.page, DEFAULT_PAGE),
            limit: parsePositiveInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT)
        };
    }

    private requireUser(request: Request<unknown, unknown, unknown>): IAccessTokenPayload {
        const authUser = (request as unknown as IAuthenticatedRequest).user;

        if (!authUser) {
            throw new ForbiddenError("Authentication required");
        }

        return authUser;
    }

    private assertCanAccess(authUser: IAccessTokenPayload, quote: IStoredQuote): void {
        if (
            authUser.role === USER_ROLES.Customer &&
            this.resolveOwnerId(quote) !== authUser.userId
        ) {
            throw new ForbiddenError("You can only access your own quotes");
        }
    }

    /** Extracts the owner id whether userId is populated or a raw ObjectId. */
    private resolveOwnerId(quote: IStoredQuote): string {
        const owner = quote.userId;
        const raw =
            owner && typeof owner === "object" && "_id" in owner
                ? (owner as { _id: mongoose.Types.ObjectId | string })._id
                : (owner as mongoose.Types.ObjectId | string);

        return raw instanceof mongoose.Types.ObjectId ? raw.toHexString() : String(raw);
    }
}
