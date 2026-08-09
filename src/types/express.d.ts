import { UserPayload } from "./auth"; // replace with your actual user type

declare global {
    namespace Express {
        interface Request {
            user?: UserPayload;
        }
    }
}