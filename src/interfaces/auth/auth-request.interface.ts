import { Request } from "express";
import { IAccessTokenPayload } from "./jwt.interface.js";

export interface IAuthenticatedRequest extends Request {
    user?: IAccessTokenPayload;
}