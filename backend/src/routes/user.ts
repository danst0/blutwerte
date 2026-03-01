import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, saveUserData } from '../services/fileStore';

export const userRouter = Router();

const lifestyleSchema = z.object({
  smoking: z.enum(['never', 'former', 'occasional', 'regular']).optional(),
  alcohol: z.enum(['never', 'rarely', 'moderate', 'regular']).optional(),
  exercise: z.enum(['none', 'light', 'moderate', 'active', 'very_active']).optional(),
  diet: z.enum(['mixed', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'other']).optional(),
  sleep_hours: z.number().min(4).max(12).optional(),
  stress_level: z.enum(['low', 'moderate', 'high', 'very_high']).optional(),
}).optional();

const profileSchema = z.object({
  gender: z.enum(['male', 'female']).optional(),
  diagnoses: z.array(z.string().min(1).max(200)).max(50).optional(),
  medications: z.array(z.string().min(1).max(200)).max(50).optional(),
  lifestyle: lifestyleSchema,
});

// PATCH /api/user/profile
userRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = profileSchema.parse(req.body);

    const data = getUserData(userId);
    if (parsed.gender !== undefined) data.gender = parsed.gender;
    if (parsed.diagnoses !== undefined) data.diagnoses = parsed.diagnoses;
    if (parsed.medications !== undefined) data.medications = parsed.medications;
    if (parsed.lifestyle !== undefined) data.lifestyle = parsed.lifestyle;
    saveUserData(data);

    res.json({
      success: true,
      gender: data.gender,
      diagnoses: data.diagnoses,
      medications: data.medications,
      lifestyle: data.lifestyle,
    });
  })
);
