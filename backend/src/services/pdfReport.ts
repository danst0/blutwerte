import PDFDocument from 'pdfkit';
import type { Gender, ValueStatus } from '../types';
import type { AiFinding, AiReport } from './aiReport';
import { describeLifestyle, groupByCategory, type ReportModel, type ReportValue } from './reportData';
import {
  formatDateDE,
  formatNumberDE,
  formatValueDE,
  getStatusLabel,
  getValueStatus,
} from './status';

type Doc = PDFKit.PDFDocument;

// ─── Gestaltung ───────────────────────────────────────────────────────────────

const C = {
  ink: '#0F172A',
  body: '#334155',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  hairline: '#F1F5F9',
  surface: '#F8FAFC',
  white: '#FFFFFF',
  accent: '#2563EB',
  accentSoft: '#EFF6FF',
  brand: '#B91C1C',
  brandDeep: '#6B1212',
  green: '#15803D',
  greenSoft: '#ECFDF5',
  greenLine: '#86EFAC',
  amber: '#B45309',
  amberSoft: '#FFFBEB',
  red: '#B91C1C',
  redSoft: '#FEF2F2',
} as const;

const F = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
} as const;

const STATUS_STYLE: Record<ValueStatus, { fg: string; bg: string; dot: string }> = {
  normal: { fg: '#15803D', bg: '#ECFDF5', dot: '#22C55E' },
  warning: { fg: '#B45309', bg: '#FFFBEB', dot: '#F59E0B' },
  high: { fg: '#B91C1C', bg: '#FEF2F2', dot: '#EF4444' },
  low: { fg: '#B91C1C', bg: '#FEF2F2', dot: '#EF4444' },
  critical_high: { fg: '#7F1D1D', bg: '#FEE2E2', dot: '#B91C1C' },
  critical_low: { fg: '#7F1D1D', bg: '#FEE2E2', dot: '#B91C1C' },
  unknown: { fg: '#475569', bg: '#F1F5F9', dot: '#94A3B8' },
};

const FINDING_STYLE: Record<AiFinding['severity'], { fg: string; bg: string; label: string }> = {
  critical: { fg: '#7F1D1D', bg: '#FEE2E2', label: 'Dringend' },
  warning: { fg: C.amber, bg: C.amberSoft, label: 'Beachten' },
  info: { fg: C.accent, bg: C.accentSoft, label: 'Hinweis' },
  good: { fg: C.green, bg: C.greenSoft, label: 'Erfreulich' },
};

function shortStatusLabel(status: ValueStatus): string {
  switch (status) {
    case 'critical_high': return 'Krit. hoch';
    case 'critical_low': return 'Krit. tief';
    case 'unknown': return 'Ohne Ref.';
    default: return getStatusLabel(status);
  }
}

// ─── Zeichensatz ──────────────────────────────────────────────────────────────

/**
 * Die eingebauten PDF-Fonts können nur WinAnsi darstellen. Laborzeichen und
 * KI-Texte enthalten aber gelegentlich griechische Buchstaben, Pfeile oder
 * Emoji – die werden hier ersetzt statt als Datenmüll gedruckt.
 */
const REPLACEMENTS: Record<string, string> = {
  'μ': 'µ', 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'Δ': 'Delta', 'δ': 'delta',
  '→': '->', '←': '<-', '↑': 'hoch', '↓': 'runter', '↗': '->', '↘': '->',
  '≤': '<=', '≥': '>=', '≈': '~', '−': '-', '∅': 'O', '‑': '-',
  '✓': '-', '✔': '-', '✗': 'x',
  // Einheiten wie "×10⁶/µL" verlieren sonst ihre Größenordnung
  '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9', 'ⁿ': '^n',
};

const WINANSI_EXTRA = new Set(
  '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'.split('')
);

function w(text: string): string {
  let out = '';
  for (const ch of (text ?? '').normalize('NFC')) {
    const code = ch.codePointAt(0)!;
    if (ch === '\n' || ch === '\t' || (code >= 32 && code <= 126) || (code >= 160 && code <= 255) || WINANSI_EXTRA.has(ch)) {
      out += ch;
    } else {
      out += REPLACEMENTS[ch] ?? '';
    }
  }
  return out;
}

// ─── Layout-Hilfen ────────────────────────────────────────────────────────────

const MARGIN = { top: 58, bottom: 62, left: 48, right: 48 };
const BANNER_HEIGHT = 138;

function innerWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right;
}

function pageBottom(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: Doc, needed: number): void {
  if (doc.y + needed > pageBottom(doc)) doc.addPage();
}

function truncate(doc: Doc, text: string, maxWidth: number): string {
  if (doc.widthOfString(text) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && doc.widthOfString(`${cut}…`) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

function sectionTitle(doc: Doc, title: string, subtitle?: string): void {
  ensureSpace(doc, 62);
  const x = doc.page.margins.left;
  const y = doc.y;

  doc.save();
  doc.roundedRect(x, y + 2, 3, 16, 1.5).fill(C.brand);
  doc.restore();

  doc.font(F.bold).fontSize(14).fillColor(C.ink).text(w(title), x + 12, y, { lineBreak: false });
  let next = y + 20;

  if (subtitle) {
    doc.font(F.regular).fontSize(8.5).fillColor(C.muted).text(w(subtitle), x + 12, next, {
      width: innerWidth(doc) - 12,
    });
    next = doc.y + 4;
  }

  doc.moveTo(x, next + 4).lineTo(x + innerWidth(doc), next + 4).lineWidth(0.6).stroke(C.line);
  doc.y = next + 16;
  doc.x = x;
}

/** Farbig hinterlegtes Label, z. B. der Status in der Wertetabelle. */
function pill(doc: Doc, x: number, y: number, text: string, fg: string, bg: string, width?: number): number {
  doc.font(F.bold).fontSize(7);
  const label = width ? truncate(doc, text, width - 10) : text;
  const boxWidth = width ?? doc.widthOfString(label) + 12;

  doc.roundedRect(x, y, boxWidth, 12, 6).fill(bg);
  doc.fillColor(fg).text(w(label), x, y + 3.2, { width: boxWidth, align: 'center', lineBreak: false });
  return boxWidth;
}

// ─── Kopf- und Fußzeilen ──────────────────────────────────────────────────────

function drawRunningHeader(doc: Doc, model: ReportModel): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);

  doc.font(F.bold).fontSize(7.5).fillColor(C.brand)
    .text(w('BLUTWERTE-ANALYSE'), x, 30, { width: width / 2, lineBreak: false, characterSpacing: 0.8 });
  doc.font(F.regular).fontSize(7.5).fillColor(C.faint)
    .text(w(model.displayName), x + width / 2, 30, { width: width / 2, align: 'right', lineBreak: false });
  doc.moveTo(x, 42).lineTo(x + width, 42).lineWidth(0.6).stroke(C.line);

  doc.y = doc.page.margins.top;
  doc.x = x;
}

function drawFooters(doc: Doc, model: ReportModel): void {
  const range = doc.bufferedPageRange();
  const created = formatDateDE(model.generatedAt.toISOString().slice(0, 10));

  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const x = doc.page.margins.left;
    const width = innerWidth(doc);
    const y = doc.page.height - 44;

    // Ohne freigegebenen Unterrand legt PDFKit für jede Fußzeile eine neue Seite an
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc.moveTo(x, y - 8).lineTo(x + width, y - 8).lineWidth(0.6).stroke(C.line);
    doc.font(F.regular).fontSize(7).fillColor(C.faint)
      .text(w(`Automatisch erstellt am ${created} – ersetzt keine ärztliche Diagnose.`), x, y, {
        width: width * 0.7,
        lineBreak: false,
      });
    doc.font(F.regular).fontSize(7).fillColor(C.faint)
      .text(w(`Seite ${i - range.start + 1} von ${range.count}`), x + width * 0.7, y, {
        width: width * 0.3,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = bottomMargin;
  }
}

// ─── Titelbanner ──────────────────────────────────────────────────────────────

function drawBloodDrop(doc: Doc, cx: number, top: number, r: number): void {
  const bottom = top + r * 2.15;
  doc.save();
  doc.path(
    `M ${cx} ${top} ` +
    `C ${cx + r * 1.2} ${top + r * 1.05}, ${cx + r} ${bottom}, ${cx} ${bottom} ` +
    `C ${cx - r} ${bottom}, ${cx - r * 1.2} ${top + r * 1.05}, ${cx} ${top} Z`
  ).fillOpacity(0.95).fill(C.white);
  doc.restore();
}

function periodLabel(model: ReportModel): string {
  if (!model.periodFrom || !model.periodTo) return 'Noch keine Messwerte erfasst';
  const termine = `${model.entries.length} ${model.entries.length === 1 ? 'Messtermin' : 'Messtermine'}`;
  return model.periodFrom === model.periodTo
    ? `Messung vom ${formatDateDE(model.periodTo)}`
    : `${formatDateDE(model.periodFrom)} – ${formatDateDE(model.periodTo)} · ${termine}`;
}

function drawBanner(doc: Doc, model: ReportModel): void {
  const width = doc.page.width;
  const gradient = doc.linearGradient(0, 0, width, BANNER_HEIGHT);
  gradient.stop(0, C.brandDeep).stop(1, C.brand);

  doc.save();
  doc.rect(0, 0, width, BANNER_HEIGHT).fill(gradient);

  // Dezenter Akzentbogen in der rechten oberen Ecke
  doc.circle(width - 40, 12, 96).fillOpacity(0.06).fill(C.white);
  doc.fillOpacity(1);
  doc.restore();

  const x = MARGIN.left;
  drawBloodDrop(doc, x + 8, 34, 8);

  doc.font(F.bold).fontSize(8).fillColor(C.white).fillOpacity(0.85)
    .text(w('GESUNDHEITSBERICHT'), x + 26, 36, { characterSpacing: 1.6, lineBreak: false });
  doc.fillOpacity(1);

  doc.font(F.bold).fontSize(27).fillColor(C.white)
    .text(w('Blutwerte-Analyse'), x, 58, { lineBreak: false });

  doc.font(F.regular).fontSize(11).fillColor(C.white).fillOpacity(0.92)
    .text(w(model.displayName), x, 95, { lineBreak: false });
  doc.fontSize(8.5).fillOpacity(0.78)
    .text(w(periodLabel(model)), x, 111, { lineBreak: false });
  doc.fillOpacity(1);

  const created = formatDateDE(model.generatedAt.toISOString().slice(0, 10));
  doc.font(F.regular).fontSize(8.5).fillColor(C.white).fillOpacity(0.78)
    .text(w(`Erstellt am ${created}`), doc.page.width / 2, 111, {
      width: doc.page.width / 2 - MARGIN.right,
      align: 'right',
      lineBreak: false,
    });
  doc.fillOpacity(1);

  doc.x = x;
  doc.y = BANNER_HEIGHT + 26;
}

// ─── Kennzahlen ───────────────────────────────────────────────────────────────

function drawStatTiles(doc: Doc, model: ReportModel): void {
  const tiles = [
    { label: 'Werte gesamt', count: model.counts.total, fg: C.accent, bg: C.accentSoft },
    { label: 'Im Normbereich', count: model.counts.normal, fg: C.green, bg: C.greenSoft },
    { label: 'Grenzwertig', count: model.counts.warning, fg: C.amber, bg: C.amberSoft },
    { label: 'Auffällig', count: model.counts.abnormal, fg: C.red, bg: C.redSoft },
  ];

  const gap = 10;
  const width = (innerWidth(doc) - gap * (tiles.length - 1)) / tiles.length;
  const height = 60;
  const x0 = doc.page.margins.left;
  const y = doc.y;

  ensureSpace(doc, height + 18);

  tiles.forEach((tile, i) => {
    const x = x0 + i * (width + gap);
    doc.roundedRect(x, y, width, height, 8).fill(tile.bg);
    doc.font(F.bold).fontSize(23).fillColor(tile.fg)
      .text(String(tile.count), x + 12, y + 11, { width: width - 24, lineBreak: false });
    doc.font(F.regular).fontSize(8).fillColor(C.muted)
      .text(w(tile.label), x + 12, y + 40, { width: width - 24, lineBreak: false });
  });

  doc.x = x0;
  doc.y = y + height + 18;
}

// ─── Profilkarte ──────────────────────────────────────────────────────────────

function profileRows(model: ReportModel): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];

  if (model.gender) rows.push({ label: 'Geschlecht', value: model.gender === 'male' ? 'Männlich' : 'Weiblich' });
  rows.push({ label: 'Zeitraum', value: model.months > 0 ? `Letzte ${model.months} Monate` : 'Gesamter Verlauf' });
  if (model.diagnoses.length) rows.push({ label: 'Diagnosen', value: model.diagnoses.join(', ') });
  if (model.medications.length) rows.push({ label: 'Medikamente', value: model.medications.join(', ') });

  const lifestyle = describeLifestyle(model.lifestyle);
  if (lifestyle.length) {
    rows.push({ label: 'Lifestyle', value: lifestyle.map((l) => `${l.label}: ${l.value}`).join(' · ') });
  }

  return rows;
}

function drawProfileCard(doc: Doc, model: ReportModel): void {
  const rows = profileRows(model);
  if (rows.length === 0) return;

  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 14;
  const labelWidth = 78;
  const valueWidth = width - padding * 2 - labelWidth - 8;

  doc.font(F.regular).fontSize(8.5);
  const heights = rows.map((r) => Math.max(12, doc.heightOfString(w(r.value), { width: valueWidth })));
  const cardHeight = padding * 2 + heights.reduce((a, b) => a + b + 6, 0) - 6;

  ensureSpace(doc, cardHeight + 18);
  const y = doc.y;

  doc.roundedRect(x, y, width, cardHeight, 8).fillAndStroke(C.surface, C.line);

  let cursor = y + padding;
  rows.forEach((row, i) => {
    doc.font(F.bold).fontSize(7).fillColor(C.faint)
      .text(w(row.label.toUpperCase()), x + padding, cursor + 1.5, {
        width: labelWidth,
        lineBreak: false,
        characterSpacing: 0.5,
      });
    doc.font(F.regular).fontSize(8.5).fillColor(C.body)
      .text(w(row.value), x + padding + labelWidth + 8, cursor, { width: valueWidth });
    cursor += heights[i] + 6;
  });

  doc.x = x;
  doc.y = y + cardHeight + 18;
}

// ─── Warnhinweis ──────────────────────────────────────────────────────────────

function drawCriticalAlert(doc: Doc, model: ReportModel): void {
  const critical = model.values.filter(
    (v) => v.status === 'critical_high' || v.status === 'critical_low'
  );
  if (critical.length === 0) return;

  const names = critical
    .map((v) => `${v.long_name || v.name} (${formatValueDE(v.latest.value, v.latest.comparator)} ${v.unit})`)
    .join(', ');
  const body = `Folgende Werte liegen im kritischen Bereich: ${names}. Bitte besprich diesen Bericht zeitnah mit deiner Ärztin oder deinem Arzt.`;

  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 12;
  const textWidth = width - padding * 2 - 6;

  doc.font(F.regular).fontSize(8.5);
  const height = padding * 2 + 14 + doc.heightOfString(w(body), { width: textWidth });

  ensureSpace(doc, height + 16);
  const y = doc.y;

  doc.roundedRect(x, y, width, height, 8).fill('#FEE2E2');
  doc.roundedRect(x, y, 3.5, height, 1.75).fill('#B91C1C');

  doc.font(F.bold).fontSize(10).fillColor('#7F1D1D')
    .text(w('Kritische Werte vorhanden'), x + padding + 6, y + padding, { width: textWidth, lineBreak: false });
  doc.font(F.regular).fontSize(8.5).fillColor('#7F1D1D')
    .text(w(body), x + padding + 6, y + padding + 15, { width: textWidth });

  doc.x = x;
  doc.y = y + height + 18;
}

// ─── KI-Analyse ───────────────────────────────────────────────────────────────

function drawNoticeBox(doc: Doc, title: string, body: string, fg: string, bg: string): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 12;
  const textWidth = width - padding * 2;

  doc.font(F.regular).fontSize(8.5);
  const height = padding * 2 + 14 + doc.heightOfString(w(body), { width: textWidth });

  ensureSpace(doc, height + 16);
  const y = doc.y;

  doc.roundedRect(x, y, width, height, 8).fill(bg);
  doc.font(F.bold).fontSize(9.5).fillColor(fg)
    .text(w(title), x + padding, y + padding, { width: textWidth, lineBreak: false });
  doc.font(F.regular).fontSize(8.5).fillColor(fg)
    .text(w(body), x + padding, y + padding + 15, { width: textWidth });

  doc.x = x;
  doc.y = y + height + 16;
}

function drawSummaryBlock(doc: Doc, summary: string): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 14;
  const textWidth = width - padding * 2 - 6;

  doc.font(F.regular).fontSize(10);
  const height = padding * 2 + doc.heightOfString(w(summary), { width: textWidth, lineGap: 3.5 });

  ensureSpace(doc, height + 16);
  const y = doc.y;

  doc.roundedRect(x, y, width, height, 8).fill(C.accentSoft);
  doc.roundedRect(x, y, 3.5, height, 1.75).fill(C.accent);
  doc.font(F.regular).fontSize(10).fillColor('#1E3A8A')
    .text(w(summary), x + padding + 6, y + padding, { width: textWidth, lineGap: 3.5 });

  doc.x = x;
  doc.y = y + height + 18;
}

function drawFindings(doc: Doc, findings: AiFinding[]): void {
  if (findings.length === 0) return;

  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 12;
  const textWidth = width - padding * 2 - 6;

  doc.font(F.bold).fontSize(9.5).fillColor(C.ink);
  ensureSpace(doc, 30);
  doc.text(w('Einzelbefunde'), x, doc.y, { lineBreak: false });
  doc.y += 16;

  for (const finding of findings) {
    const style = FINDING_STYLE[finding.severity];

    doc.font(F.regular).fontSize(8.5);
    const textHeight = doc.heightOfString(w(finding.text), { width: textWidth, lineGap: 2.5 });
    const height = padding * 2 + 14 + textHeight;

    ensureSpace(doc, height + 8);
    const y = doc.y;

    doc.roundedRect(x, y, width, height, 7).fillAndStroke(C.white, C.line);
    doc.roundedRect(x, y, 3.5, height, 1.75).fill(style.fg);

    doc.font(F.bold).fontSize(9.5).fillColor(C.ink);
    const titleWidth = textWidth - 70;
    doc.text(w(finding.title), x + padding + 6, y + padding, { width: titleWidth, lineBreak: false });
    pill(doc, x + width - padding - 62, y + padding, style.label, style.fg, style.bg, 62);

    doc.font(F.regular).fontSize(8.5).fillColor(C.body)
      .text(w(finding.text), x + padding + 6, y + padding + 15, { width: textWidth, lineGap: 2.5 });

    doc.x = x;
    doc.y = y + height + 8;
  }

  doc.y += 8;
}

/** Kleines Dreieck bzw. Strich als Trendzeichen – WinAnsi kennt keine Pfeile. */
function drawTrendGlyph(doc: Doc, x: number, y: number, direction: 'up' | 'down' | 'stable', color: string): void {
  doc.save();
  if (direction === 'stable') {
    doc.roundedRect(x, y + 3.5, 8, 1.8, 0.9).fill(color);
  } else if (direction === 'up') {
    doc.path(`M ${x + 4} ${y} L ${x + 8} ${y + 7} L ${x} ${y + 7} Z`).fill(color);
  } else {
    doc.path(`M ${x + 4} ${y + 7} L ${x} ${y} L ${x + 8} ${y} Z`).fill(color);
  }
  doc.restore();
}

function drawTrendList(doc: Doc, trends: AiReport['trends']): void {
  if (trends.length === 0) return;

  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const textWidth = width - 24;

  doc.font(F.bold).fontSize(9.5).fillColor(C.ink);
  ensureSpace(doc, 30);
  doc.text(w('Entwicklung im Zeitverlauf'), x, doc.y, { lineBreak: false });
  doc.y += 14;

  for (const trend of trends) {
    doc.font(F.bold).fontSize(9);
    const titleHeight = 12;
    doc.font(F.regular).fontSize(8.5);
    const textHeight = doc.heightOfString(w(trend.text), { width: textWidth, lineGap: 2.5 });

    ensureSpace(doc, titleHeight + textHeight + 12);
    const y = doc.y;
    const color = trend.direction === 'stable' ? C.muted : C.accent;

    drawTrendGlyph(doc, x + 2, y + 2, trend.direction, color);
    doc.font(F.bold).fontSize(9).fillColor(C.ink)
      .text(w(trend.title), x + 24, y, { width: textWidth, lineBreak: false });
    doc.font(F.regular).fontSize(8.5).fillColor(C.body)
      .text(w(trend.text), x + 24, y + titleHeight, { width: textWidth, lineGap: 2.5 });

    doc.x = x;
    doc.y = y + titleHeight + textHeight + 10;
  }

  doc.y += 4;
}

function drawRecommendations(doc: Doc, recommendations: string[]): void {
  if (recommendations.length === 0) return;

  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const padding = 14;
  const textWidth = width - padding * 2 - 24;

  doc.font(F.regular).fontSize(9);
  const heights = recommendations.map((r) =>
    Math.max(14, doc.heightOfString(w(r), { width: textWidth, lineGap: 2 }))
  );
  const height = padding * 2 + 20 + heights.reduce((a, b) => a + b + 8, 0) - 8;

  ensureSpace(doc, Math.min(height, 220) + 16);
  const y = doc.y;

  doc.roundedRect(x, y, width, height, 8).fillAndStroke(C.greenSoft, '#BBF7D0');
  doc.font(F.bold).fontSize(9.5).fillColor(C.green)
    .text(w('Empfehlungen'), x + padding, y + padding, { lineBreak: false });

  let cursor = y + padding + 20;
  recommendations.forEach((rec, i) => {
    doc.circle(x + padding + 6, cursor + 5, 6).fill(C.green);
    doc.font(F.bold).fontSize(7).fillColor(C.white)
      .text(String(i + 1), x + padding, cursor + 2.6, { width: 12, align: 'center', lineBreak: false });
    doc.font(F.regular).fontSize(9).fillColor('#14532D')
      .text(w(rec), x + padding + 24, cursor, { width: textWidth, lineGap: 2 });
    cursor += heights[i] + 8;
  });

  doc.x = x;
  doc.y = y + height + 18;
}

function drawRawAiText(doc: Doc, text: string): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);

  for (const block of text.split(/\n{2,}/)) {
    const paragraph = block.trim();
    if (!paragraph) continue;
    const isBullet = /^[-*•]\s/.test(paragraph);
    doc.font(F.regular).fontSize(9.5).fillColor(C.body);
    ensureSpace(doc, 28);
    doc.text(w(paragraph.replace(/^[-*]\s/gm, '• ')), x, doc.y, {
      width,
      lineGap: 3,
      indent: isBullet ? 6 : 0,
    });
    doc.y += 8;
  }
  doc.y += 8;
}

function drawAiSection(doc: Doc, ai: AiReport | null, aiError?: string): void {
  sectionTitle(doc, 'Einschätzung des KI-Doktors', 'Automatisch erstellte Auswertung auf Basis der erfassten Werte, Diagnosen und Lebensgewohnheiten.');

  if (!ai) {
    drawNoticeBox(
      doc,
      'KI-Analyse nicht verfügbar',
      aiError || 'Die KI-Analyse wurde für diesen Bericht nicht angefordert.',
      C.amber,
      C.amberSoft
    );
    return;
  }

  if (ai.rawText) {
    drawRawAiText(doc, ai.rawText);
    return;
  }

  if (ai.summary) drawSummaryBlock(doc, ai.summary);
  drawFindings(doc, ai.findings);
  drawTrendList(doc, ai.trends);
  drawRecommendations(doc, ai.recommendations);
}

// ─── Wertetabelle ─────────────────────────────────────────────────────────────

const COLUMNS = { name: 146, value: 56, unit: 54, ref: 68, position: 72, delta: 44 };
const ROW_HEIGHT = 19;

/** Die Statusspalte nimmt den Rest auf, damit die Tabelle bündig abschließt. */
function columnLayout(doc: Doc): typeof COLUMNS & { status: number } {
  const used = Object.values(COLUMNS).reduce((a, b) => a + b, 0);
  return { ...COLUMNS, status: innerWidth(doc) - used };
}

function refLabel(v: ReportValue): string {
  const { min, max } = v.range;
  if (min === -Infinity && max === Infinity) return '–';
  if (min === -Infinity) return `≤ ${formatNumberDE(max)}`;
  if (max === Infinity) return `≥ ${formatNumberDE(min)}`;
  return `${formatNumberDE(min)} – ${formatNumberDE(max)}`;
}

/**
 * Positionsbalken: zeigt den Referenzbereich als grünes Band und den
 * Messwert als Punkt darauf – auf einen Blick erkennbar, wie weit ein Wert
 * vom Zielkorridor entfernt liegt.
 */
function drawPositionBar(doc: Doc, x: number, y: number, width: number, v: ReportValue): void {
  const { min, max } = v.range;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    doc.font(F.regular).fontSize(8).fillColor(C.faint)
      .text('–', x, y - 2, { width, align: 'center', lineBreak: false });
    return;
  }

  const value = v.latest.value;
  const span = max - min;
  const lo = Math.min(min - span * 0.5, value - span * 0.15);
  const hi = Math.max(max + span * 0.5, value + span * 0.15);
  const scale = (n: number) => x + ((n - lo) / (hi - lo)) * width;
  const barY = y + 1;

  doc.roundedRect(x, barY, width, 5, 2.5).fill(C.hairline);
  doc.roundedRect(scale(min), barY, Math.max(2, scale(max) - scale(min)), 5, 2.5).fill('#BBF7D0');

  const dotX = Math.min(x + width - 2, Math.max(x + 2, scale(value)));
  doc.circle(dotX, barY + 2.5, 3.4).fill(STATUS_STYLE[v.status].dot);
}

function drawTableHeader(doc: Doc): void {
  const x = doc.page.margins.left;
  const y = doc.y;
  const cols = columnLayout(doc);
  let cursor = x;

  doc.font(F.bold).fontSize(6.8).fillColor(C.faint);
  const headers: Array<[string, number, 'left' | 'right' | 'center']> = [
    ['WERT', cols.name, 'left'],
    ['AKTUELL', cols.value, 'right'],
    ['EINHEIT', cols.unit, 'left'],
    ['REFERENZ', cols.ref, 'left'],
    ['LAGE', cols.position, 'center'],
    ['VERÄND.', cols.delta, 'right'],
    ['STATUS', cols.status, 'center'],
  ];

  for (const [label, width, align] of headers) {
    const pad = align === 'left' ? 2 : align === 'right' ? 6 : 0;
    doc.text(w(label), cursor + (align === 'left' ? pad : 0), y, {
      width: width - pad,
      align,
      lineBreak: false,
      characterSpacing: 0.4,
    });
    cursor += width;
  }

  doc.moveTo(x, y + 11).lineTo(x + innerWidth(doc), y + 11).lineWidth(0.8).stroke(C.line);
  doc.y = y + 15;
}

function drawValueRow(doc: Doc, v: ReportValue, index: number): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const cols = columnLayout(doc);
  const y = doc.y;

  if (index % 2 === 1) doc.rect(x, y - 3, width, ROW_HEIGHT).fill(C.surface);

  let cursor = x;
  const style = STATUS_STYLE[v.status];

  doc.font(F.bold).fontSize(8.5).fillColor(C.ink);
  doc.text(w(truncate(doc, v.long_name || v.name, cols.name - 8)), cursor + 2, y + 2.5, { lineBreak: false });
  cursor += cols.name;

  doc.font(F.bold).fontSize(9).fillColor(style.fg)
    .text(w(formatValueDE(v.latest.value, v.latest.comparator)), cursor, y + 2, {
      width: cols.value - 6,
      align: 'right',
      lineBreak: false,
    });
  cursor += cols.value;

  doc.font(F.regular).fontSize(7);
  doc.fillColor(C.muted).text(w(truncate(doc, v.unit, cols.unit - 8)), cursor + 6, y + 4, { lineBreak: false });
  cursor += cols.unit;

  doc.font(F.regular).fontSize(7.5);
  doc.fillColor(C.muted).text(w(truncate(doc, refLabel(v), cols.ref - 6)), cursor + 2, y + 3.5, { lineBreak: false });
  cursor += cols.ref;

  drawPositionBar(doc, cursor + 4, y + 3.5, cols.position - 8, v);
  cursor += cols.position;

  if (v.changePct === undefined) {
    doc.font(F.regular).fontSize(7.5).fillColor(C.faint)
      .text('–', cursor, y + 3.5, { width: cols.delta - 6, align: 'right', lineBreak: false });
  } else {
    const rounded = Math.abs(v.changePct) >= 100 ? v.changePct.toFixed(0) : v.changePct.toFixed(1);
    const label = `${v.changePct > 0 ? '+' : ''}${rounded.replace('.', ',')} %`;
    doc.font(F.regular).fontSize(7.5).fillColor(v.trend === 'stable' ? C.faint : C.body)
      .text(w(label), cursor, y + 3.5, { width: cols.delta - 6, align: 'right', lineBreak: false });
  }
  cursor += cols.delta;

  pill(doc, cursor, y + 2, shortStatusLabel(v.status), style.fg, style.bg, cols.status);

  doc.x = x;
  doc.y = y + ROW_HEIGHT;
}

function drawValueTables(doc: Doc, model: ReportModel): void {
  const scopeNote =
    model.scope === 'abnormal'
      ? `Gefiltert auf auffällige Werte – ${model.hiddenCount} unauffällige Werte sind ausgeblendet.`
      : 'Alle erfassten Werte mit jüngster Messung, Referenzbereich und Veränderung zur Vormessung.';

  sectionTitle(doc, 'Aktueller Stand', scopeNote);

  if (model.values.length === 0) {
    doc.font(F.regular).fontSize(9.5).fillColor(C.muted)
      .text(w('Keine Werte im gewählten Zeitraum vorhanden.'), doc.page.margins.left, doc.y, {
        width: innerWidth(doc),
      });
    doc.y += 16;
    return;
  }

  for (const [category, values] of groupByCategory(model.values)) {
    ensureSpace(doc, 60);

    doc.font(F.bold).fontSize(9.5).fillColor(C.ink);
    doc.circle(doc.page.margins.left + 3, doc.y + 5, 3).fill(C.accent);
    doc.fillColor(C.ink).text(w(category), doc.page.margins.left + 12, doc.y, { lineBreak: false });
    doc.y += 16;

    drawTableHeader(doc);

    values.forEach((v, i) => {
      if (doc.y + ROW_HEIGHT > pageBottom(doc)) {
        doc.addPage();
        drawTableHeader(doc);
      }
      drawValueRow(doc, v, i);
    });

    doc.y += 14;
  }
}

// ─── Verlaufsdiagramme ────────────────────────────────────────────────────────

const CHART = { height: 124, gap: 12, titleHeight: 30, padLeft: 34, padRight: 10, padBottom: 16 };

function chartDomain(v: ReportValue): { yMin: number; yMax: number } {
  const values = v.history.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.abs(hi) * 0.2 || 1;

  let yMin = lo - span * 0.35;
  let yMax = hi + span * 0.35;

  // Referenzgrenzen nur einbeziehen, solange sie das Diagramm nicht zerquetschen
  const { min, max } = v.range;
  if (Number.isFinite(min) && min > lo - span * 3) yMin = Math.min(yMin, min - span * 0.2);
  if (Number.isFinite(max) && max < hi + span * 3) yMax = Math.max(yMax, max + span * 0.2);

  // Laborwerte sind nie negativ – eine negative Achse verwirrt nur
  if (lo >= 0 && yMin < 0) yMin = 0;

  return yMin === yMax ? { yMin: yMin - 1, yMax: yMax + 1 } : { yMin, yMax };
}

function shortDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}.${month}.${year.slice(2)}`;
}

function drawChart(doc: Doc, x: number, y: number, width: number, v: ReportValue, gender?: Gender): void {
  const height = CHART.height;
  doc.roundedRect(x, y, width, height, 7).fillAndStroke(C.white, C.line);

  // Ohne width-Option kann PDFKit die Zeile nicht umbrechen – der Rechtsbündigkeit
  // wird stattdessen über die gemessene Textbreite nachgeholfen.
  doc.font(F.bold).fontSize(8);
  const latestLabel = w(truncate(doc, `${formatValueDE(v.latest.value, v.latest.comparator)} ${v.unit}`, width * 0.5));
  const latestWidth = doc.widthOfString(latestLabel);

  doc.font(F.bold).fontSize(8.5).fillColor(C.ink);
  doc.text(w(truncate(doc, v.long_name || v.name, width - latestWidth - 30)), x + 10, y + 9, { lineBreak: false });

  doc.font(F.bold).fontSize(8).fillColor(STATUS_STYLE[v.status].fg)
    .text(latestLabel, x + width - 10 - latestWidth, y + 9, { lineBreak: false });

  const px = x + CHART.padLeft;
  const py = y + CHART.titleHeight;
  const pw = width - CHART.padLeft - CHART.padRight;
  const ph = height - CHART.titleHeight - CHART.padBottom;

  const { yMin, yMax } = chartDomain(v);
  const toY = (value: number) => py + ph - ((value - yMin) / (yMax - yMin)) * ph;

  const times = v.history.map((p) => Date.parse(p.date));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const toX = (i: number) =>
    t1 > t0 ? px + ((times[i] - t0) / (t1 - t0)) * pw : px + (pw * i) / Math.max(1, v.history.length - 1);

  // Referenzband
  const { min, max } = v.range;
  const bandTop = Math.max(py, toY(Number.isFinite(max) ? max : yMax));
  const bandBottom = Math.min(py + ph, toY(Number.isFinite(min) ? min : yMin));
  if (bandBottom > bandTop) {
    doc.rect(px, bandTop, pw, bandBottom - bandTop).fill(C.greenSoft);
    doc.save().lineWidth(0.6).dash(2, { space: 2 }).strokeColor(C.greenLine);
    if (Number.isFinite(max) && max <= yMax) doc.moveTo(px, bandTop).lineTo(px + pw, bandTop).stroke();
    if (Number.isFinite(min) && min >= yMin) doc.moveTo(px, bandBottom).lineTo(px + pw, bandBottom).stroke();
    doc.undash().restore();
  }

  // Grundlinie
  doc.moveTo(px, py + ph).lineTo(px + pw, py + ph).lineWidth(0.6).stroke(C.line);

  // Messreihe
  doc.save().lineWidth(1.4).strokeColor(C.accent).lineJoin('round');
  v.history.forEach((point, i) => {
    const cx = toX(i);
    const cy = toY(point.value);
    if (i === 0) doc.moveTo(cx, cy);
    else doc.lineTo(cx, cy);
  });
  doc.stroke();
  doc.restore();

  v.history.forEach((point, i) => {
    const status = getValueStatus(point.value, v.ref, gender, point.comparator);
    const color = v.ref ? STATUS_STYLE[status].dot : C.accent;
    doc.circle(toX(i), toY(point.value), 2.6).fillAndStroke(color, C.white);
  });

  // Achsenbeschriftung
  doc.font(F.regular).fontSize(6).fillColor(C.faint);
  doc.text(w(formatNumberDE(Number(yMax.toPrecision(3)))), x + 6, py - 2, {
    width: CHART.padLeft - 10,
    align: 'right',
    lineBreak: false,
  });
  doc.text(w(formatNumberDE(Number(yMin.toPrecision(3)))), x + 6, py + ph - 5, {
    width: CHART.padLeft - 10,
    align: 'right',
    lineBreak: false,
  });
  doc.text(w(shortDate(v.history[0].date)), px, py + ph + 5, { width: pw / 2, lineBreak: false });
  doc.text(w(shortDate(v.history[v.history.length - 1].date)), px + pw / 2, py + ph + 5, {
    width: pw / 2,
    align: 'right',
    lineBreak: false,
  });
}

function drawTrendCharts(doc: Doc, model: ReportModel): void {
  const charted = model.values.filter((v) => v.history.length >= 2);
  if (charted.length === 0) return;

  doc.addPage();
  sectionTitle(
    doc,
    'Entwicklung der letzten Zeit',
    `Verlauf aller Werte mit mindestens zwei Messungen. Das grüne Band markiert den Referenzbereich.`
  );

  const columnWidth = (innerWidth(doc) - CHART.gap) / 2;

  for (let i = 0; i < charted.length; i += 2) {
    ensureSpace(doc, CHART.height + CHART.gap);
    const y = doc.y;
    drawChart(doc, doc.page.margins.left, y, columnWidth, charted[i], model.gender);
    if (charted[i + 1]) {
      drawChart(doc, doc.page.margins.left + columnWidth + CHART.gap, y, columnWidth, charted[i + 1], model.gender);
    }
    doc.x = doc.page.margins.left;
    doc.y = y + CHART.height + CHART.gap;
  }
}

// ─── Abschluss ────────────────────────────────────────────────────────────────

function drawDisclaimer(doc: Doc): void {
  const x = doc.page.margins.left;
  const width = innerWidth(doc);
  const text =
    'Dieser Bericht wurde automatisch aus den selbst erfassten Laborwerten erstellt. Die Einordnung erfolgt anhand ' +
    'allgemeiner Referenzbereiche und einer KI-gestützten Auswertung. Er ersetzt weder eine ärztliche Diagnose noch ' +
    'eine Beratung oder Behandlung. Bei gesundheitlichen Beschwerden oder auffälligen Werten wende dich bitte an eine ' +
    'Ärztin oder einen Arzt.';

  doc.font(F.regular).fontSize(7.5);
  const padding = 12;
  const height = padding * 2 + doc.heightOfString(w(text), { width: width - padding * 2, lineGap: 1.5 });

  ensureSpace(doc, height + 10);
  const y = doc.y;

  doc.roundedRect(x, y, width, height, 7).fillAndStroke(C.surface, C.line);
  doc.font(F.regular).fontSize(7.5).fillColor(C.muted)
    .text(w(text), x + padding, y + padding, { width: width - padding * 2, lineGap: 1.5 });

  doc.y = y + height + 8;
}

// ─── Einstieg ─────────────────────────────────────────────────────────────────

export function renderReportPdf(model: ReportModel, ai: AiReport | null, aiError?: string): Doc {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { ...MARGIN },
    bufferPages: true,
    info: {
      Title: `Blutwerte-Analyse ${model.displayName}`,
      Author: 'Blutwerte Health Tracker',
      Subject: 'Auswertung der Laborwerte',
      CreationDate: model.generatedAt,
    },
  });

  // Greift ab Seite 2 – die erste Seite trägt stattdessen das Titelbanner.
  doc.on('pageAdded', () => drawRunningHeader(doc, model));

  drawBanner(doc, model);
  drawStatTiles(doc, model);
  drawProfileCard(doc, model);
  drawCriticalAlert(doc, model);
  drawAiSection(doc, ai, aiError);
  drawValueTables(doc, model);
  drawTrendCharts(doc, model);
  drawDisclaimer(doc);
  drawFooters(doc, model);

  doc.end();
  return doc;
}
