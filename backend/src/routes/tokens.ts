import { Router } from 'express';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, saveUserData } from '../services/fileStore';

export const tokensRouter = Router();
tokensRouter.use(requireAuth);

const MAX_TOKENS = 10;

// GET /api/tokens – list all tokens (without exposing the token value)
tokensRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const tokens = (data.api_tokens ?? []).map(({ id, name, created_at }) => ({ id, name, created_at }));
    res.json(tokens);
  })
);

// POST /api/tokens – create a new token
tokensRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = z.object({ name: z.string().min(1).max(100) }).safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.format() });
    }

    const userId = req.session.userId!;
    const data = getUserData(userId);
    data.api_tokens = data.api_tokens ?? [];

    if (data.api_tokens.length >= MAX_TOKENS) {
      return res.status(400).json({ error: `Maximal ${MAX_TOKENS} Tokens erlaubt` });
    }

    const newToken = {
      id: uuidv4(),
      name: parsed.data.name,
      token: `bt_${randomBytes(32).toString('hex')}`,
      created_at: new Date().toISOString(),
    };

    data.api_tokens.push(newToken);
    saveUserData(data);

    // Return the full token only on creation
    res.status(201).json(newToken);
  })
);

// DELETE /api/tokens/:id – revoke a token
tokensRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const idx = (data.api_tokens ?? []).findIndex((t) => t.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Token nicht gefunden' });
    }

    data.api_tokens!.splice(idx, 1);
    saveUserData(data);

    res.json({ success: true });
  })
);
