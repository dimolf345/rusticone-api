import { Router } from "express";

import { QuotesController } from "../controllers/quote.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createQuotesRouter(controller = new QuotesController()) {
    const router = Router();

    router.use(authMiddleware);

    router.post("/", asyncHandler(controller.createOne));
    router.get("/", asyncHandler(controller.findAll));

    //:id
    router.get("/:id", asyncHandler(controller.findOne));
    router.patch("/:id", asyncHandler(controller.update));
    router.post("/:id/comments", asyncHandler(controller.addComment));
    router.patch("/:id/comments/:commentId", asyncHandler(controller.updateComment));
    router.delete("/:id", isAdminMiddleware, asyncHandler(controller.delete));

    return router;
}

export const quotesRouter = createQuotesRouter();
