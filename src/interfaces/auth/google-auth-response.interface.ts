export interface SerializedAuthUser {
    id: string;
    role: string;
    email: string;
    name: string;
    authProvider: string;
    authProviderUserId: string;
    avatarUrl?: string;
    emailVerified: boolean;
    lastLoginAt?: string;
    createdAt: string;
    updatedAt: string;
}

export interface AuthenticatedGoogleUserResponse {
    accessToken: string;
    isNewUser: boolean;
    user: SerializedAuthUser;
}