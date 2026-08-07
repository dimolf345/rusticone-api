import { Request } from "express";
import { AccessTokenPayload } from "./jwt.interface.js";

export interface AuthenticatedRequest extends Request {
    user?: AccessTokenPayload;
}