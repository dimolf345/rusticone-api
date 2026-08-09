import { NextFunction, Response } from "express";
import { AuthenticatedRequest } from "../interfaces/auth/auth-request.interface.js";
import { USER_ROLES } from "../models/user.js";

export function isAdminMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
    const isAdmin = req.user && req.user.role === USER_ROLES.Admin;
    if (!isAdmin) {
        res.status(403).json({
            message: "You do not have permission to perform admin operations."
        });
        return;
    }
    next();
}