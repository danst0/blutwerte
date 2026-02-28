import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, saveUserData } from '../services/fileStore';

export const bloodValuesRouter = Router();
bloodValuesRouter.use(requireAuth);

const bloodValueSchema = z.object({
  name: z.string().min(1).max(100),
  value: z.number().finite(),
  unit: z.string().min(1).max(50),
  category: z.string().min(1).max(100),
});

const entrySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  lab_name: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  values: z.array(bloodValueSchema).min(1),
});

// GET /api/bloodvalues – get all entries
bloodValuesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    // Sort entries by date descending
    data.entries.sort((a, b) => b.date.localeCompare(a.date));
    res.json(data);
  })
);

// POST /api/bloodvalues – create new entry
bloodValuesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = entrySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.format() });
    }

    const data = getUserData(userId);
    const newEntry = {
      id: uuidv4(),
      ...parsed.data,
    };

    data.entries.push(newEntry);
    saveUserData(data);

    res.status(201).json(newEntry);
  })
);

// GET /api/bloodvalues/:id – get single entry
bloodValuesRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const entry = data.entries.find((e) => e.id === req.params.id);

    if (!entry) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    res.json(entry);
  })
);

// PUT /api/bloodvalues/:id – update entry
bloodValuesRouter.put(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = entrySchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.format() });
    }

    const data = getUserData(userId);
    const idx = data.entries.findIndex((e) => e.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    data.entries[idx] = { ...data.entries[idx], ...parsed.data };
    saveUserData(data);

    res.json(data.entries[idx]);
  })
);

// DELETE /api/bloodvalues/:id – delete entry
bloodValuesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const data = getUserData(userId);
    const idx = data.entries.findIndex((e) => e.id === req.params.id);

    if (idx === -1) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    data.entries.splice(idx, 1);
    saveUserData(data);

    res.json({ success: true });
  })
);

// GET /api/bloodvalues/history/:valueName – get history for a specific blood value
bloodValuesRouter.get(
  '/history/:valueName',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const valueName = decodeURIComponent(req.params.valueName);
    const data = getUserData(userId);

    const history = data.entries
      .flatMap((entry) => {
        const val = entry.values.find(
          (v) => v.name.toLowerCase() === valueName.toLowerCase()
        );
        if (!val) return [];
        return [{ date: entry.date, value: val.value, unit: val.unit, entryId: entry.id }];
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    res.json({ name: valueName, history });
  })
);
