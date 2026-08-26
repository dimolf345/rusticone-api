export interface IAccessTokenPayload {
    userId: string;
    email: string;
    role: string;
    sid: string;
}

export interface IRefreshTokenPayload {
    userId: string;
    sid: string;
    generation: number;
    jti: string;
    expiresAt: Date;
}
