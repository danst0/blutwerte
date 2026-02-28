import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { getUserData, getChatHistory, saveChatHistory, checkAndIncrementAIRate } from '../services/fileStore';
import { chat } from '../services/llm';
import type { LLMMessage, ChatMessage } from '../types';

export const aiRouter = Router();
aiRouter.use(requireAuth);

const messageSchema = z.object({
  message: z.string().min(1).max(4000),
});

// GET /api/ai/history – get chat history
aiRouter.get(
  '/history',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const history = getChatHistory(userId);
    res.json(history);
  })
);

// DELETE /api/ai/history – clear chat history
aiRouter.delete(
  '/history',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    saveChatHistory(userId, { user_id: userId, messages: [] });
    res.json({ success: true });
  })
);

// POST /api/ai/chat – send message
aiRouter.post(
  '/chat',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = messageSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.format() });
    }

    // Rate limiting: max 50 AI requests per user per day
    const allowed = checkAndIncrementAIRate(userId, 50);
    if (!allowed) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: 'Du hast das tägliche Limit von 50 KI-Anfragen erreicht. Versuche es morgen wieder.',
      });
    }

    const userData = getUserData(userId);
    const chatHistory = getChatHistory(userId);

    // Build messages for LLM (last 20 messages for context)
    const contextMessages: LLMMessage[] = chatHistory.messages
      .slice(-20)
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

    contextMessages.push({ role: 'user', content: parsed.data.message });

    // Save user message
    const userMessage: ChatMessage = {
      id: uuidv4(),
      role: 'user',
      content: parsed.data.message,
      timestamp: new Date().toISOString(),
    };
    chatHistory.messages.push(userMessage);

    // Call LLM
    const response = await chat(contextMessages, userData);

    if (response.error) {
      return res.status(503).json({ error: response.error });
    }

    // Save assistant message
    const assistantMessage: ChatMessage = {
      id: uuidv4(),
      role: 'assistant',
      content: response.content,
      timestamp: new Date().toISOString(),
    };
    chatHistory.messages.push(assistantMessage);
    saveChatHistory(userId, chatHistory);

    res.json({
      message: assistantMessage,
      userMessage,
    });
  })
);
