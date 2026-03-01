import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, saveUserData } from '../services/fileStore';

export const userRouter = Router();

const profileSchema = z.object({
  gender: z.enum(['male', 'female']),
});

// PATCH /api/user/profile
userRouter.patch(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = profileSchema.parse(req.body);

    const data = getUserData(userId);
    data.gender = parsed.gender;
    saveUserData(data);

    res.json({ success: true, gender: data.gender });
  })
);
