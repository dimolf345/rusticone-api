import type { Request, Response } from "express";

import { NotFoundError } from "../errors/index.js";
import type {
    IBaseControllerInterface,
    IBaseServiceInterface,
    EntityFilter,
    IFindAllOptions
} from "../interfaces/base.interface.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parses a positive integer from a query value and falls back when the input is invalid.
 */
function parsePositiveInteger(
    value: unknown,
    fallback: number,
    maximum?: number
): number {
    if (typeof value !== "string" || !/^\d+$/.test(value)) {
        return fallback;
    }

    const parsed = Number.parseInt(value, 10);

    if (!Number.isSafeInteger(parsed) || parsed < 1) {
        return fallback;
    }

    return maximum === undefined ? parsed : Math.min(maximum, parsed);
}

export abstract class BaseController<
    TEntity,
    TCreate,
    TUpdate
> implements IBaseControllerInterface<TEntity, TCreate, TUpdate> {
    constructor(
        protected readonly service: IBaseServiceInterface<TEntity, TCreate, TUpdate>,
        private readonly _resourceName = "resource"
    ) { }

    get resourceName() {
        return this._resourceName;
    }

    /**
     * Creates a new entity for the configured resource.
     */
    public createOne = async (
        request: Request<unknown, unknown, TCreate>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Creating ${this.resourceName}`);

        const entity = await this.service.createOne(request.body);
        response.status(201).json(entity);
    };

    /**
     * Returns a paginated list of entities for the configured resource.
     */
    public findAll = async (
        request: Request,
        response: Response
    ): Promise<void> => {
        request.log.info(`Finding all ${this.resourceName}s`);

        const options = this.createFindAllOptions(request.query);
        const result = await this.service.findAll(options);
        response.status(200).json(result);
    };

    /**
     * Normalizes supported query params into a filter and page/limit options.
     * Ignores reserved keys such as page, limit, and nested/operator fields.
     */
    public createFindAllOptions(
        query: Request["query"]
    ): IFindAllOptions<TEntity> {
        const filter: Record<string, unknown> = Object.create(null);

        if (query && typeof query === "object") {
            for (const [key, value] of Object.entries(query)) {
                if (
                    key === "page" ||
                    key === "limit" ||
                    key === "__proto__" ||
                    key === "constructor" ||
                    key.startsWith("$") ||
                    key.includes(".")
                ) {
                    continue;
                }

                // 1. Single string: convert to case-insensitive regex pattern
                if (typeof value === "string" && value.trim() !== "") {
                    filter[key] = { $regex: value, $options: "i" };
                }
                // 2. Multiple values (e.g., ?email=customer&email=admin): join with '|' for OR regex search
                else if (
                    Array.isArray(value) &&
                    value.length > 0 &&
                    value.every((item) => typeof item === "string")
                ) {
                    const pattern = value.join("|"); // Matches any of the array items
                    filter[key] = { $regex: pattern, $options: "i" };
                }
            }
        }

        return {
            filter: filter as EntityFilter<TEntity>,
            page: parsePositiveInteger(query?.page, DEFAULT_PAGE),
            limit: parsePositiveInteger(query?.limit, DEFAULT_LIMIT, MAX_LIMIT)
        };
    }

    /**
     * Returns a single entity by id.
     */
    public findOne = async (
        request: Request<{ id: string }>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Finding ${this.resourceName} ${request.params.id}`);

        const entity = await this.service.findOne(request.params.id);

        if (!entity) {
            throw new NotFoundError(`${this.resourceName} not found`);
        }

        response.status(200).json(entity);
    };

    /**
     * Updates an existing entity by id.
     */
    public update = async (
        request: Request<{ id: string }, unknown, TUpdate>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Updating ${this.resourceName} ${request.params.id}`);

        const entity = await this.service.update(request.params.id, request.body);

        if (!entity) {
            throw new NotFoundError(`${this.resourceName} not found`);
        }

        response.status(200).json(entity);
    };

    /**
     * Deletes an existing entity by id.
     */
    public delete = async (
        request: Request<{ id: string }>,
        response: Response
    ): Promise<void> => {
        request.log.info(`Deleting ${this.resourceName} ${request.params.id}`);

        const entity = await this.service.delete(request.params.id);

        if (!entity) {
            throw new NotFoundError(`${this.resourceName} not found`);
        }

        response.status(204).send();
    };
}
