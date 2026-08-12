import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async Express handler so any rejected promise is forwarded to
 * `next(err)`, removing the need for repetitive try/catch blocks in controllers.
 *
 * @example
 * router.get("/:id", asyncHandler(async (req, res) => {
 *   const item = await service.findOne(req.params.id);
 *   if (!item) throw new NotFoundError("Item not found");
 *   res.json(item);
 * }));
 */
export const asyncHandler =
  <Req extends Request = Request>(
    fn: (request: Req, response: Response, next: NextFunction) => Promise<unknown>
  ): RequestHandler =>
  (request, response, next) => {
    Promise.resolve(fn(request as Req, response, next)).catch(next);
  };
