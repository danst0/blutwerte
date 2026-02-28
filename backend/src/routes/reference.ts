import { Router } from 'express';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getReferenceDatabase, searchReferenceValues, findReferenceValue } from '../services/fileStore';

export const referenceRouter = Router();
referenceRouter.use(requireAuth);

// GET /api/reference – all reference values
referenceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = getReferenceDatabase();
    res.json(db);
  })
);

// GET /api/reference/categories – unique categories
referenceRouter.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const db = getReferenceDatabase();
    const categories = [...new Set(db.values.map((v) => v.category))].sort();
    res.json(categories);
  })
);

// GET /api/reference/search?q=... – search reference values
referenceRouter.get(
  '/search',
  asyncHandler(async (req, res) => {
    const query = (req.query.q as string) || '';
    if (!query.trim()) {
      const db = getReferenceDatabase();
      return res.json(db.values.slice(0, 20));
    }
    const results = searchReferenceValues(query);
    res.json(results);
  })
);

// GET /api/reference/:name – single reference value by name
referenceRouter.get(
  '/:name',
  asyncHandler(async (req, res) => {
    const name = decodeURIComponent(req.params.name);
    const ref = findReferenceValue(name);
    if (!ref) {
      return res.status(404).json({ error: 'Reference value not found' });
    }
    res.json(ref);
  })
);
