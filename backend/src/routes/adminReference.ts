import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin, asyncHandler } from '../middleware/requireAuth';
import {
  getReferenceDatabase,
  saveReferenceDatabase,
  updateReferenceVersion,
} from '../services/fileStore';

export const adminReferenceRouter = Router();

adminReferenceRouter.use(requireAuth, requireAdmin);

const referenceValueSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  short_name: z.string().optional(),
  long_name: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  category: z.string().min(1),
  unit: z.string().min(1),
  ref_min: z.number().optional(),
  ref_max: z.number().optional(),
  ref_min_female: z.number().optional(),
  ref_max_female: z.number().optional(),
  ref_min_male: z.number().optional(),
  ref_max_male: z.number().optional(),
  optimal_min: z.number().optional(),
  optimal_max: z.number().optional(),
  critical_low: z.number().optional(),
  critical_high: z.number().optional(),
  description: z.string().default(''),
  high_info: z.string().default(''),
  low_info: z.string().default(''),
  recommendations: z.string().default(''),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 64);
}

// GET /api/admin/reference
adminReferenceRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const db = getReferenceDatabase();
    res.json(db);
  })
);

// POST /api/admin/reference
adminReferenceRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const body = referenceValueSchema.omit({ id: true }).parse(req.body);
    const db = getReferenceDatabase();

    const id = slugify(body.name) || `value_${Date.now()}`;
    if (db.values.some((v) => v.id === id)) {
      return res.status(409).json({ error: 'Conflict', message: `Ein Wert mit ID "${id}" existiert bereits` });
    }

    const newValue = { id, ...body };
    const updated = updateReferenceVersion({ ...db, values: [...db.values, newValue] });
    saveReferenceDatabase(updated);
    res.status(201).json(newValue);
  })
);

// PUT /api/admin/reference/:id
adminReferenceRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = referenceValueSchema.parse(req.body);

    if (body.id !== id) {
      return res.status(400).json({ error: 'Bad Request', message: 'ID im Body stimmt nicht mit URL überein' });
    }

    const db = getReferenceDatabase();
    const index = db.values.findIndex((v) => v.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Not Found', message: `Wert "${id}" nicht gefunden` });
    }

    const values = [...db.values];
    values[index] = body;
    const updated = updateReferenceVersion({ ...db, values });
    saveReferenceDatabase(updated);
    res.json(body);
  })
);

// DELETE /api/admin/reference/:id
adminReferenceRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const db = getReferenceDatabase();
    const index = db.values.findIndex((v) => v.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Not Found', message: `Wert "${id}" nicht gefunden` });
    }

    const values = db.values.filter((v) => v.id !== id);
    const updated = updateReferenceVersion({ ...db, values });
    saveReferenceDatabase(updated);
    res.json({ success: true });
  })
);
