import type { GoogleAuthProfile } from "./google-auth-profile.interface.js";

export interface GoogleAuthServiceDependencies {
    verifyGoogleIdToken?: (idToken: string) => Promise<GoogleAuthProfile>;
    jwtSecret?: string;
    jwtExpiresIn?: string | number;
}