export interface JwtPayload {
  sub: string;
  role: number;
  tokenType: 'access' | 'refresh';
  jti: string;
  exp?: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
}
