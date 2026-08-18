export interface IAuthRouterDependencies {
    verifyGoogleIdToken?: (idToken: string) => Promise<{
        authProviderUserId: string;
        email: string;
        name: string;
        avatarUrl?: string;
        emailVerified: boolean;
    }>;
    jwtSecret?: string;
    jwtExpiresIn?: string | number;
}