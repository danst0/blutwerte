import { createHash, randomBytes } from 'crypto';

interface OIDCDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  end_session_endpoint?: string;
}

const discoveryCache = new Map<string, { data: OIDCDiscovery; cachedAt: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

async function discoverOIDC(issuerUrl: string): Promise<OIDCDiscovery> {
  const cached = discoveryCache.get(issuerUrl);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL) {
    return cached.data;
  }

  const discoveryUrl = `${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const response = await fetch(discoveryUrl, { signal: AbortSignal.timeout(10000) });

  if (!response.ok) {
    throw new Error(`OIDC discovery failed (${response.status}): ${response.statusText}`);
  }

  const data = (await response.json()) as OIDCDiscovery;
  discoveryCache.set(issuerUrl, { data, cachedAt: Date.now() });
  return data;
}

export function generateCodeVerifier(): string {
  return randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function generateState(): string {
  return randomBytes(16).toString('hex');
}

export async function getAuthorizationUrl(
  issuerUrl: string,
  clientId: string,
  redirectUri: string,
  scopes: string,
  state: string,
  codeVerifier: string
): Promise<string> {
  const discovery = await discoverOIDC(issuerUrl);
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return `${discovery.authorization_endpoint}?${params.toString()}`;
}

export interface OIDCUserInfo {
  userId: string;
  displayName: string;
  email: string;
}

export async function exchangeCodeForUserInfo(
  issuerUrl: string,
  clientId: string,
  clientSecret: string | undefined,
  redirectUri: string,
  code: string,
  codeVerifier: string
): Promise<OIDCUserInfo> {
  const discovery = await discoverOIDC(issuerUrl);

  // Exchange code for tokens
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: codeVerifier,
  });

  if (clientSecret) {
    body.set('client_secret', clientSecret);
  }

  const tokenResponse = await fetch(discovery.token_endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!tokenResponse.ok) {
    const error = await tokenResponse.text();
    throw new Error(`Token exchange failed (${tokenResponse.status}): ${error}`);
  }

  const tokens = (await tokenResponse.json()) as {
    access_token: string;
    id_token?: string;
    token_type: string;
  };

  // Get user info
  const userInfoResponse = await fetch(discovery.userinfo_endpoint, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
    signal: AbortSignal.timeout(10000),
  });

  if (!userInfoResponse.ok) {
    throw new Error(`UserInfo request failed (${userInfoResponse.status})`);
  }

  const userInfo = (await userInfoResponse.json()) as {
    sub: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    preferred_username?: string;
    email?: string;
  };

  const displayName =
    userInfo.name ||
    [userInfo.given_name, userInfo.family_name].filter(Boolean).join(' ') ||
    userInfo.preferred_username ||
    userInfo.sub;

  return {
    userId: userInfo.sub,
    displayName,
    email: userInfo.email || '',
  };
}

export async function getLogoutUrl(issuerUrl: string): Promise<string | null> {
  try {
    const discovery = await discoverOIDC(issuerUrl);
    return discovery.end_session_endpoint || null;
  } catch {
    return null;
  }
}
