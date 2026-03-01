import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, saveUserData, getSharesIndex, saveSharesIndex, findUserByEmail, getReferenceDatabase } from '../services/fileStore';
import type { Share, ShareIndexEntry } from '../types';

export const sharesRouter = Router();
sharesRouter.use(requireAuth);

const createShareSchema = z.object({
  email: z.string().email(),
  expires_at: z.string().datetime().optional(),
});

// GET /api/shares/given – list shares I've given
sharesRouter.get(
  '/given',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const shares = (data.shares_given ?? []).filter(
      (s) => !s.expires_at || new Date(s.expires_at) > new Date()
    );
    res.json(shares);
  })
);

// POST /api/shares – create a new share
sharesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const parsed = createShareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validierungsfehler', details: parsed.error.format() });
    }

    const userId = req.session.userId!;
    const email = parsed.data.email.toLowerCase();

    // Cannot share with yourself
    const ownerData = getUserData(userId);
    if (ownerData.email.toLowerCase() === email) {
      return res.status(400).json({ error: 'Du kannst nicht mit dir selbst teilen' });
    }

    // Check if recipient exists
    const recipient = findUserByEmail(email);
    if (!recipient) {
      return res.status(404).json({ error: 'Kein Benutzer mit dieser E-Mail-Adresse gefunden' });
    }

    // Check for duplicate
    const existing = (ownerData.shares_given ?? []).find(
      (s) => s.shared_with_email === email && (!s.expires_at || new Date(s.expires_at) > new Date())
    );
    if (existing) {
      return res.status(409).json({ error: 'Du teilst bereits mit diesem Benutzer' });
    }

    const share: Share = {
      id: uuidv4(),
      owner_user_id: userId,
      owner_display_name: ownerData.display_name,
      shared_with_email: email,
      shared_with_user_id: recipient.user_id,
      permission: 'read',
      expires_at: parsed.data.expires_at,
      created_at: new Date().toISOString(),
    };

    // Save to owner's data
    ownerData.shares_given = ownerData.shares_given ?? [];
    ownerData.shares_given.push(share);
    saveUserData(ownerData);

    // Update central index
    const index = getSharesIndex();
    const entry: ShareIndexEntry = {
      share_id: share.id,
      owner_user_id: share.owner_user_id,
      owner_display_name: share.owner_display_name,
      expires_at: share.expires_at,
      created_at: share.created_at,
    };
    if (!index[email]) index[email] = [];
    index[email].push(entry);
    saveSharesIndex(index);

    res.status(201).json(share);
  })
);

// DELETE /api/shares/:id – revoke a share
sharesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const shares = data.shares_given ?? [];
    const idx = shares.findIndex((s) => s.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Share nicht gefunden' });
    }

    const removed = shares.splice(idx, 1)[0];
    data.shares_given = shares;
    saveUserData(data);

    // Update central index
    const index = getSharesIndex();
    const email = removed.shared_with_email;
    if (index[email]) {
      index[email] = index[email].filter((e) => e.share_id !== removed.id);
      if (index[email].length === 0) delete index[email];
      saveSharesIndex(index);
    }

    res.json({ success: true });
  })
);

// GET /api/shares/received – list shares shared with me
sharesRouter.get(
  '/received',
  asyncHandler(async (req, res) => {
    const email = req.session.email?.toLowerCase();
    if (!email) {
      return res.json([]);
    }

    const index = getSharesIndex();
    const entries = (index[email] ?? []).filter(
      (e) => !e.expires_at || new Date(e.expires_at) > new Date()
    );
    res.json(entries);
  })
);

// GET /api/shares/received/:shareId/data – get shared blood values (read-only)
sharesRouter.get(
  '/received/:shareId/data',
  asyncHandler(async (req, res) => {
    const email = req.session.email?.toLowerCase();
    if (!email) {
      return res.status(403).json({ error: 'Kein Zugriff' });
    }

    const index = getSharesIndex();
    const entries = index[email] ?? [];
    const entry = entries.find((e) => e.share_id === req.params.shareId);

    if (!entry) {
      return res.status(404).json({ error: 'Share nicht gefunden' });
    }

    // Check expiry
    if (entry.expires_at && new Date(entry.expires_at) <= new Date()) {
      return res.status(410).json({ error: 'Dieser Share ist abgelaufen' });
    }

    // Load owner's data (without sensitive fields)
    const ownerData = getUserData(entry.owner_user_id);
    res.json({
      user_id: ownerData.user_id,
      display_name: ownerData.display_name,
      gender: ownerData.gender,
      entries: ownerData.entries,
    });
  })
);

// GET /api/shares/received/:shareId/reference – get reference values
sharesRouter.get(
  '/received/:shareId/reference',
  asyncHandler(async (req, res) => {
    const email = req.session.email?.toLowerCase();
    if (!email) {
      return res.status(403).json({ error: 'Kein Zugriff' });
    }

    const index = getSharesIndex();
    const entries = index[email] ?? [];
    const entry = entries.find((e) => e.share_id === req.params.shareId);

    if (!entry) {
      return res.status(404).json({ error: 'Share nicht gefunden' });
    }

    if (entry.expires_at && new Date(entry.expires_at) <= new Date()) {
      return res.status(410).json({ error: 'Dieser Share ist abgelaufen' });
    }

    res.json(getReferenceDatabase());
  })
);
