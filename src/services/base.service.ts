import type { Model } from "mongoose";

import type {
  BaseServiceInterface,
  FindAllOptions,
  PaginatedResult
} from "../interfaces/base.interface.js";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function normalizePositiveInteger(
  value: number | undefined,
  fallback: number,
  maximum?: number
): number {
  if (value === undefined || !Number.isSafeInteger(value) || value < 1) {
    return fallback;
  }

  return maximum === undefined ? value : Math.min(maximum, value);
}

export abstract class BaseService<
  TEntity,
  TCreate,
  TUpdate
> implements BaseServiceInterface<TEntity, TCreate, TUpdate> {
  protected constructor(protected readonly model: Model<TEntity>) { }

  async createOne(data: TCreate): Promise<TEntity> {
    return this.model.create(data as unknown as TEntity);
  }

  async findAll(
    options: FindAllOptions<TEntity> = {}
  ): Promise<PaginatedResult<TEntity>> {
    const page = normalizePositiveInteger(options.page, DEFAULT_PAGE);
    const limit = normalizePositiveInteger(
      options.limit,
      DEFAULT_LIMIT,
      MAX_LIMIT
    );
    const filter = (options.filter ?? {}) as never;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.model.find(filter).skip(skip).limit(limit).exec() as Promise<
        TEntity[]
      >,
      this.model.countDocuments(filter).exec()
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  async findOne(id: string): Promise<TEntity | null> {
    return this.model.findById(id).exec() as Promise<TEntity | null>;
  }

  async update(id: string, data: TUpdate): Promise<TEntity | null> {
    return this.model
      .findByIdAndUpdate(id, data as Partial<TEntity>, {
        returnDocument: "after",
        runValidators: true
      })
      .exec() as Promise<TEntity | null>;
  }

  async delete(id: string): Promise<TEntity | null> {
    return this.model.findByIdAndDelete(id).exec() as Promise<TEntity | null>;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isValidUpdate(payload: TUpdate, ...args: unknown[]): boolean {
    throw new Error('Method isValidUpdate not implemented');
  }
}
