export interface AutodeskTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface CachedAccessToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  scope: string[];
  obtainedAt: number;
  expiresAt: number;
}

export interface OAuthStateRecord {
  state: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  sessionKey: string;
  createdAt: number;
  expiresAt: number;
}

export interface AuthorizationUrlResult {
  authorizationUrl: string;
  state: string;
  redirectUri: string;
  scope: string;
  sessionKey: string;
  expiresAt: string;
}

export interface AuthStatus {
  sessionKey: string;
  loggedIn: boolean;
  expiresAt?: string;
  scopes?: string[];
  tokenType?: string;
  cacheBackend: string;
}
