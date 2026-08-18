export interface IGoogleAuthProfile {
    authProviderUserId: string;
    email: string;
    name: string;
    avatarUrl?: string;
    emailVerified: boolean;
}