export interface GoogleAuthProfile {
    authProviderUserId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified: boolean;
}