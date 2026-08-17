import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { AddonsController } from "../controllers/addon.controller.js";

export function createAddonsRouter(controller = new AddonsController()) {
    const router = Router();

    router.use(authMiddleware);

    router.post("/", isAdminMiddleware, asyncHandler(controller.createOne));
    router.get("/", asyncHandler(controller.findAll));

    //:id
    router.get("/:id", asyncHandler(controller.findOne));
    router.patch("/:id", isAdminMiddleware, asyncHandler(controller.update));
    router.delete("/:id", isAdminMiddleware, asyncHandler(controller.delete));


    return router;
}

export const addonsRouter = createAddonsRouter();