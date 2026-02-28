import { Router } from 'express';
import { getConfig } from '../config';
import {
  getAuthorizationUrl,
  exchangeCodeForUserInfo,
  generateCodeVerifier,
  generateState,
  getLogoutUrl,
} from '../auth/oidc';
import { ensureUserProfile } from '../services/fileStore';
import { asyncHandler } from '../middleware/requireAuth';

export const authRouter = Router();

// GET /api/auth/login – initiate OIDC flow
authRouter.get(
  '/login',
  asyncHandler(async (req, res) => {
    const config = getConfig();

    if (config.DEV_AUTO_LOGIN) {
      req.session.userId = 'dev-user';
      req.session.displayName = 'Dev User';
      req.session.email = 'dev@localhost';
      ensureUserProfile('dev-user', 'Dev User', 'dev@localhost');
      return res.redirect('/');
    }

    if (!config.OIDC_ISSUER_URL || !config.OIDC_CLIENT_ID || !config.OIDC_REDIRECT_URI) {
      return res.status(503).json({ error: 'OIDC not configured' });
    }

    const state = generateState();
    const codeVerifier = generateCodeVerifier();

    req.session.oidcState = state;
    req.session.oidcCodeVerifier = codeVerifier;

    const url = await getAuthorizationUrl(
      config.OIDC_ISSUER_URL,
      config.OIDC_CLIENT_ID,
      config.OIDC_REDIRECT_URI,
      config.OIDC_SCOPES,
      state,
      codeVerifier
    );

    res.redirect(url);
  })
);

// GET /api/auth/callback – handle OIDC callback
authRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const config = getConfig();
    const { code, state, error: oidcError } = req.query as Record<string, string>;

    if (oidcError) {
      console.error('OIDC error:', oidcError);
      return res.redirect(`/?error=${encodeURIComponent(oidcError)}`);
    }

    if (!code || !state) {
      return res.redirect('/?error=missing_params');
    }

    if (state !== req.session.oidcState) {
      return res.redirect('/?error=invalid_state');
    }

    const codeVerifier = req.session.oidcCodeVerifier;
    if (!codeVerifier) {
      return res.redirect('/?error=missing_verifier');
    }

    // Clear OIDC session data
    delete req.session.oidcState;
    delete req.session.oidcCodeVerifier;

    if (!config.OIDC_ISSUER_URL || !config.OIDC_CLIENT_ID || !config.OIDC_REDIRECT_URI) {
      return res.redirect('/?error=oidc_not_configured');
    }

    const userInfo = await exchangeCodeForUserInfo(
      config.OIDC_ISSUER_URL,
      config.OIDC_CLIENT_ID,
      config.OIDC_CLIENT_SECRET,
      config.OIDC_REDIRECT_URI,
      code,
      codeVerifier
    );

    req.session.userId = userInfo.userId;
    req.session.displayName = userInfo.displayName;
    req.session.email = userInfo.email;

    ensureUserProfile(userInfo.userId, userInfo.displayName, userInfo.email);

    res.redirect('/dashboard');
  })
);

// GET /api/auth/logout
authRouter.get(
  '/logout',
  asyncHandler(async (req, res) => {
    const config = getConfig();
    let logoutUrl: string | null = null;

    if (config.OIDC_ISSUER_URL) {
      logoutUrl = await getLogoutUrl(config.OIDC_ISSUER_URL);
    }

    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      if (logoutUrl) {
        res.redirect(logoutUrl);
      } else {
        res.redirect('/');
      }
    });
  })
);

// GET /api/auth/me – current user info
authRouter.get('/me', (req, res) => {
  if (!req.session?.userId) {
    return res.status(401).json({ authenticated: false });
  }
  res.json({
    authenticated: true,
    userId: req.session.userId,
    displayName: req.session.displayName,
    email: req.session.email,
  });
});
