export interface AccessTokenPayload {
    userId: string;
    email: string;
    role: string;
}

export interface RefreshTokenPayload {
    userId: string;
    expiresAt: Date;
}