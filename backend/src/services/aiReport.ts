import { callLLM } from './llm';
import { describeLifestyle, type ReportModel, type ReportValue } from './reportData';
import { formatDateDE, formatNumberDE, formatValueDE, getStatusLabel } from './status';

// ─── Ergebnisform ─────────────────────────────────────────────────────────────

export type FindingSeverity = 'critical' | 'warning' | 'info' | 'good';

export interface AiFinding {
  title: string;
  severity: FindingSeverity;
  text: string;
}

export interface AiTrend {
  title: string;
  direction: 'up' | 'down' | 'stable';
  text: string;
}

export interface AiReport {
  summary: string;
  findings: AiFinding[];
  trends: AiTrend[];
  recommendations: string[];
  /** Freitext-Fallback, wenn das Modell kein verwertbares JSON geliefert hat. */
  rawText?: string;
}

// ─── Prompt ───────────────────────────────────────────────────────────────────

const REPORT_PROMPT = `Du bist ein erfahrener medizinischer Assistent und verfasst den Analyseteil eines Blutwerte-Berichts.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt (kein Markdown, keine Code-Fences, kein Text drumherum):
{
  "summary": "3-5 Sätze Gesamteinschätzung des aktuellen Standes",
  "findings": [
    { "title": "Kurzer Titel, meist der Wertename", "severity": "critical|warning|info|good", "text": "2-4 Sätze: was der Wert bedeutet, mögliche Ursachen, wie dringend" }
  ],
  "trends": [
    { "title": "Wertename", "direction": "up|down|stable", "text": "1-3 Sätze zur Entwicklung über den Zeitraum und ihrer Bedeutung" }
  ],
  "recommendations": ["Konkrete, umsetzbare Empfehlung", "..."]
}

Regeln:
- Schreibe auf Deutsch, verständlich und einfühlsam, ohne Fachjargon-Overkill.
- "findings": 3-8 Einträge. Beginne mit den auffälligsten Werten. Nimm auch 1-2 positive
  Befunde ("good") auf, wenn es sie gibt.
- "severity": "critical" nur bei Werten, die als KRITISCH markiert sind oder deutlich
  außerhalb liegen; "warning" bei erhöht/erniedrigt/grenzwertig; "info" für Einordnendes;
  "good" für erfreuliche Befunde.
- "trends": 2-6 Einträge, nur zu Werten mit mindestens zwei Messungen. Beziehe dich auf
  die konkreten Zahlen und den Zeitraum. Lass den Abschnitt leer, wenn es keine Verläufe gibt.
- "recommendations": 3-6 Einträge, konkret (Ernährung, Bewegung, Nachkontrolle, Arztbesuch).
  Empfiehl bei kritischen Werten ausdrücklich einen zeitnahen Arztbesuch.
- Berücksichtige Diagnosen, Medikamente und Lifestyle, sofern angegeben.
- Werte mit einer Bestimmungsgrenze ("<5") sind nur in eine Richtung aussagekräftig.
- Verwende keine Markdown-Formatierung innerhalb der Texte.
- Stelle keine Diagnosen; formuliere Ursachen als Möglichkeiten.`;

/** Mehr Messpunkte je Wert machen den Prompt groß, ohne die Aussage zu verbessern. */
const MAX_HISTORY_POINTS = 8;

function describeValue(v: ReportValue): string {
  const ref =
    v.range.min !== -Infinity && v.range.max !== Infinity
      ? `Ref ${formatNumberDE(v.range.min)}–${formatNumberDE(v.range.max)}`
      : 'Ref unbekannt';

  const line = [
    `[${v.category}] ${v.long_name || v.name}: ${formatValueDE(v.latest.value, v.latest.comparator)} ${v.unit}`,
    ref,
    getStatusLabel(v.status).toUpperCase(),
  ].join(' | ');

  if (v.history.length < 2) return line;

  const points = v.history
    .slice(-MAX_HISTORY_POINTS)
    .map((p) => `${p.date}: ${formatValueDE(p.value, p.comparator)}`)
    .join(', ');
  const change =
    v.changePct !== undefined
      ? ` (${v.changePct >= 0 ? '+' : ''}${v.changePct.toFixed(1)} % ggü. Vormessung)`
      : '';

  return `${line} | Verlauf: ${points}${change}`;
}

export function buildReportContext(model: ReportModel): string {
  const lines: string[] = [];

  lines.push(`Profil: ${model.displayName}${model.gender ? ` (${model.gender === 'male' ? 'männlich' : 'weiblich'})` : ''}`);
  if (model.diagnoses.length) lines.push(`Diagnosen: ${model.diagnoses.join(', ')}`);
  if (model.medications.length) lines.push(`Medikamente: ${model.medications.join(', ')}`);

  const lifestyle = describeLifestyle(model.lifestyle);
  if (lifestyle.length) lines.push(`Lifestyle: ${lifestyle.map((l) => `${l.label}: ${l.value}`).join(' | ')}`);

  if (model.periodFrom && model.periodTo) {
    lines.push(
      `Zeitraum: ${formatDateDE(model.periodFrom)} bis ${formatDateDE(model.periodTo)} (${model.entries.length} Messtermine)`
    );
  }
  lines.push(
    `Bilanz: ${model.counts.normal} im Normalbereich, ${model.counts.warning} grenzwertig, ${model.counts.abnormal} auffällig, ${model.counts.unknown} ohne Referenz.`
  );
  lines.push('');
  lines.push('Werte (jüngste Messung, mit Verlauf sofern vorhanden):');
  for (const v of model.values) lines.push(describeValue(v));

  return lines.join('\n');
}

// ─── Antwort-Parsing ──────────────────────────────────────────────────────────

const SEVERITIES: FindingSeverity[] = ['critical', 'warning', 'info', 'good'];
const DIRECTIONS: AiTrend['direction'][] = ['up', 'down', 'stable'];

function asString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

/** Entfernt Markdown-Reste, falls das Modell die Formatierungsregel ignoriert. */
function clean(v: unknown): string {
  return asString(v).replace(/\*\*/g, '').replace(/^#+\s*/gm, '');
}

function extractJson(text: string): string | null {
  const withoutFence = text.replace(/```(?:json)?/gi, '').replace(/```/g, '');
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  return start >= 0 && end > start ? withoutFence.slice(start, end + 1) : null;
}

export function parseAiReport(text: string): AiReport {
  const json = extractJson(text);
  if (json) {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
      const trends = Array.isArray(parsed.trends) ? parsed.trends : [];
      const recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

      const report: AiReport = {
        summary: clean(parsed.summary),
        findings: findings
          .map((f) => {
            const raw = f as Record<string, unknown>;
            const severity = asString(raw.severity) as FindingSeverity;
            return {
              title: clean(raw.title),
              severity: SEVERITIES.includes(severity) ? severity : 'info',
              text: clean(raw.text),
            };
          })
          .filter((f) => f.title || f.text),
        trends: trends
          .map((t) => {
            const raw = t as Record<string, unknown>;
            const direction = asString(raw.direction) as AiTrend['direction'];
            return {
              title: clean(raw.title),
              direction: DIRECTIONS.includes(direction) ? direction : 'stable',
              text: clean(raw.text),
            };
          })
          .filter((t) => t.title || t.text),
        recommendations: recommendations.map(clean).filter(Boolean),
      };

      if (report.summary || report.findings.length || report.recommendations.length) return report;
    } catch {
      // Fällt unten auf die Freitext-Darstellung zurück
    }
  }

  return { summary: '', findings: [], trends: [], recommendations: [], rawText: clean(text) };
}

// ─── Erzeugung ────────────────────────────────────────────────────────────────

export async function generateAiReport(model: ReportModel): Promise<AiReport> {
  const context = buildReportContext(model);
  const message = `Hier sind die Blutwerte-Daten für den Bericht:\n\n${context}\n\nErstelle jetzt die Analyse als JSON.`;

  // Niedrige Temperatur: der Bericht soll faktennah und reproduzierbar sein.
  const content = await callLLM([{ role: 'user', content: message }], REPORT_PROMPT, 0.3);

  if (!content.trim()) throw new Error('Die KI hat keine Analyse zurückgegeben.');
  return parseAiReport(content);
}
