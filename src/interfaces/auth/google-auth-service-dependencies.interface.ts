import type { IGoogleAuthProfile } from "./google-auth-profile.interface.js";

export interface IGoogleAuthServiceDependencies {
    verifyGoogleIdToken?: (idToken: string) => Promise<IGoogleAuthProfile>;
    jwtSecret?: string;
    jwtExpiresIn?: string | number;
}