export interface IAccessTokenPayload {
    userId: string;
    email: string;
    role: string;
    sid: string;
}

export interface IRefreshTokenPayload {
    userId: string;
    expiresAt: Date;
}