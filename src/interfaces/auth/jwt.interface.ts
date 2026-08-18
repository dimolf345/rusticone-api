export interface IAccessTokenPayload {
    userId: string;
    email: string;
    role: string;
}

export interface IRefreshTokenPayload {
    userId: string;
    expiresAt: Date;
}