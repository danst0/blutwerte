import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, asyncHandler } from '../middleware/requireAuth';
import { checkAndIncrementAIRate, getUserData } from '../services/fileStore';
import { generateAiReport, type AiReport } from '../services/aiReport';
import { buildReportModel } from '../services/reportData';
import { renderReportPdf } from '../services/pdfReport';

export const reportRouter = Router();
reportRouter.use(requireAuth);

const optionsSchema = z.object({
  // 0 = gesamter Verlauf
  months: z.coerce.number().int().min(0).max(240).default(0),
  scope: z.enum(['all', 'abnormal']).default('all'),
  includeAi: z.boolean().default(true),
});

function fileName(displayName: string, date: string): string {
  const safeName = displayName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `Blutwerte-Analyse${safeName ? `-${safeName}` : ''}-${date}.pdf`;
}

// POST /api/report/pdf – PDF-Analyse mit optionaler KI-Einschätzung
reportRouter.post(
  '/pdf',
  asyncHandler(async (req, res) => {
    const userId = req.session.userId!;
    const parsed = optionsSchema.safeParse(req.body ?? {});

    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation error', details: parsed.error.format() });
    }

    const options = parsed.data;
    const userData = getUserData(userId);
    const model = buildReportModel(userData, options);

    if (model.entries.length === 0) {
      return res.status(400).json({
        error:
          userData.entries.length === 0
            ? 'Es sind noch keine Blutwerte erfasst. Trage zuerst Werte ein.'
            : 'Im gewählten Zeitraum liegen keine Blutwerte vor. Wähle einen längeren Zeitraum.',
      });
    }

    let ai: AiReport | null = null;
    let aiError: string | undefined;

    if (options.includeAi) {
      // Teilt sich das Tageslimit mit Chat und Scan-Import
      if (!checkAndIncrementAIRate(userId, 50)) {
        aiError = 'Das tägliche Limit von 50 KI-Anfragen ist erreicht. Der Bericht enthält daher keine KI-Einschätzung.';
      } else {
        try {
          ai = await generateAiReport(model);
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          console.error('AI report error:', msg);
          aiError = `Die KI-Einschätzung konnte nicht erstellt werden: ${msg}`;
        }
      }
    }

    const name = fileName(model.displayName, model.generatedAt.toISOString().slice(0, 10));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);

    const doc = renderReportPdf(model, ai, aiError);
    doc.pipe(res);
  })
);
