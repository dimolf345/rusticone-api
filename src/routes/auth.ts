import { Router } from "express";

import { createGoogleAuthController } from "../controllers/auth.controller.js";
import type { AuthRouterDependencies } from "../interfaces/auth/index.js";

export function createAuthRouter(dependencies: AuthRouterDependencies = {}) {
    const router = Router();

    router.post("/google", createGoogleAuthController(dependencies));

    return router;
}

export const authRouter = createAuthRouter();