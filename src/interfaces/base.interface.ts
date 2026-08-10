import type { Request, Response } from "express";

export type EntityFilter<TEntity> = Partial<
  Record<Extract<keyof TEntity, string>, unknown>
>;

export interface FindAllOptions<TEntity> {
  filter?: EntityFilter<TEntity>;
  page?: number;
  limit?: number;
}

export interface PaginatedResult<TEntity> {
  data: TEntity[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface BaseServiceInterface<TEntity, TCreate, TUpdate> {
  createOne(data: TCreate): Promise<TEntity>;
  findAll(options?: FindAllOptions<TEntity>): Promise<PaginatedResult<TEntity>>;
  findOne(id: string): Promise<TEntity | null>;
  update(id: string, data: TUpdate): Promise<TEntity | null>;
  delete(id: string): Promise<TEntity | null>;
  isValidUpdate?(payload: TUpdate, ...args: unknown[]): boolean;
}

export interface BaseControllerInterface<TEntity, TCreate, TUpdate> {
  createOne(
    request: Request<unknown, unknown, TCreate>,
    response: Response<TEntity>
  ): Promise<void>;
  findAll(
    request: Request,
    response: Response<PaginatedResult<TEntity>>
  ): Promise<void>;
  findOne(
    request: Request<{ id: string }>,
    response: Response<TEntity>
  ): Promise<void>;
  update(
    request: Request<{ id: string }, unknown, TUpdate>,
    response: Response<TEntity>
  ): Promise<void>;
  delete(
    request: Request<{ id: string }>,
    response: Response<TEntity>
  ): Promise<void>;
}
