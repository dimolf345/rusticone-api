import type { Model } from "mongoose";

import type {
  IBaseServiceInterface,
  IFindAllOptions,
  IPaginatedResult
} from "../interfaces/base.interface.js";
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
  MAX_LIMIT,
  normalizePositiveInteger
} from "../utils/pagination.js";

export abstract class BaseService<
  TEntity,
  TCreate,
  TUpdate
> implements IBaseServiceInterface<TEntity, TCreate, TUpdate> {
  protected constructor(protected readonly model: Model<TEntity>) { }

  async createOne(data: TCreate): Promise<TEntity> {
    return this.model.create(data as unknown as TEntity);
  }

  async findAll(
    options: IFindAllOptions<TEntity> = {}
  ): Promise<IPaginatedResult<TEntity>> {
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
