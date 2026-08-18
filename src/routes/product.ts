import { Router } from "express";
import { ProductsController } from "../controllers/products.controller.js";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { isAdminMiddleware } from "../middleware/is-admin.middleware.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export function createProductsRouter(controller = new ProductsController()) {
    const router = Router();

    router.use(authMiddleware);

    router.post("/", isAdminMiddleware, asyncHandler(controller.createOne));
    router.get("/", asyncHandler(controller.findAll));

    //:id
    router.get("/:id", asyncHandler(controller.findOne));
    router.patch("/:id", isAdminMiddleware, asyncHandler(controller.update));

    return router;
}

export const productsRouter = createProductsRouter();