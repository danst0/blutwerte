import { getConfig } from '../config';
import type { LLMMessage, LLMResponse, UserData, ExtractedBloodValue, ScanResult, ValueComparator, ValueStatus } from '../types';
import { findReferenceValue, matchReferenceValue } from './fileStore';
import { getEffectiveRange, getValueStatus } from './status';

const SYSTEM_PROMPT = `Du bist ein hilfreicher medizinischer Assistent, der Blutwerte erklärt und einordnet.
Du hast Zugriff auf die Blutwerte des Nutzers und kannst Trends analysieren.
Berücksichtige die Diagnosen, Medikamente und Lifestyle-Informationen des Nutzers bei deiner Analyse, sofern vorhanden.
Antworte auf Deutsch, verständlich und einfühlsam.
Gib IMMER am Ende deiner Antwort den Hinweis, dass deine Aussagen keine ärztliche Diagnose ersetzen und bei gesundheitlichen Bedenken ein Arzt aufgesucht werden sollte.
Wenn Werte kritisch außerhalb des Referenzbereichs liegen, empfiehl dringend einen zeitnahen Arztbesuch.
Beziehe dich auf die konkreten Werte des Nutzers, wenn relevant.
Formatiere deine Antworten übersichtlich mit Markdown.`;

const STATUS_MARKERS: Record<ValueStatus, string> = {
  normal: '✓ Normal',
  warning: '⚠ grenzwertig',
  high: '⬆ ÜBER Referenzbereich',
  low: '⬇ UNTER Referenzbereich',
  critical_high: '🚨 KRITISCH HOCH',
  critical_low: '🚨 KRITISCH NIEDRIG',
  unknown: '? nicht bewertbar',
};

function buildUserContext(userData: UserData): string {
  let context = '';

  // Profile info
  context += `Profil von ${userData.display_name}`;
  if (userData.gender) context += ` (${userData.gender === 'male' ? 'männlich' : 'weiblich'})`;
  context += `:\n\n`;

  // Diagnoses
  if (userData.diagnoses && userData.diagnoses.length > 0) {
    context += `**Diagnosen:** ${userData.diagnoses.join(', ')}\n\n`;
  }

  // Medications
  if (userData.medications && userData.medications.length > 0) {
    context += `**Medikamente:** ${userData.medications.join(', ')}\n\n`;
  }

  // Lifestyle
  if (userData.lifestyle) {
    const ls = userData.lifestyle;
    const parts: string[] = [];
    const labels: Record<string, Record<string, string>> = {
      smoking: { never: 'Nichtraucher', former: 'Ex-Raucher', occasional: 'Gelegenheitsraucher', regular: 'Raucher' },
      alcohol: { never: 'Kein Alkohol', rarely: 'Selten', moderate: 'Moderat', regular: 'Regelmäßig' },
      exercise: { none: 'Kein Sport', light: 'Leichte Aktivität', moderate: 'Moderate Aktivität', active: 'Aktiv', very_active: 'Sehr aktiv' },
      diet: { mixed: 'Mischkost', vegetarian: 'Vegetarisch', vegan: 'Vegan', pescatarian: 'Pescatarisch', keto: 'Keto', other: 'Andere' },
      stress_level: { low: 'Niedrig', moderate: 'Moderat', high: 'Hoch', very_high: 'Sehr hoch' },
    };
    if (ls.smoking) parts.push(`Rauchen: ${labels.smoking[ls.smoking]}`);
    if (ls.alcohol) parts.push(`Alkohol: ${labels.alcohol[ls.alcohol]}`);
    if (ls.exercise) parts.push(`Bewegung: ${labels.exercise[ls.exercise]}`);
    if (ls.diet) parts.push(`Ernährung: ${labels.diet[ls.diet]}`);
    if (ls.sleep_hours) parts.push(`Schlaf: ${ls.sleep_hours} Std/Nacht`);
    if (ls.stress_level) parts.push(`Stress: ${labels.stress_level[ls.stress_level]}`);
    if (parts.length > 0) {
      context += `**Lifestyle:** ${parts.join(' | ')}\n\n`;
    }
  }

  // Blood values
  if (userData.entries.length === 0) {
    context += 'Der Nutzer hat noch keine Blutwerte eingetragen.\n';
    return context;
  }

  const gender = userData.gender;
  const recent = userData.entries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  for (const entry of recent) {
    context += `**Eintrag vom ${entry.date}`;
    if (entry.lab_name) context += ` (${entry.lab_name})`;
    context += `:**\n`;

    for (const val of entry.values) {
      const ref = findReferenceValue(val.name);
      let status = '';
      if (ref) {
        const { min: refMin, max: refMax } = getEffectiveRange(ref, gender);
        status = ` ${STATUS_MARKERS[getValueStatus(val.value, ref, gender, val.comparator)]}`;
        if (val.comparator) status += ' (Bestimmungsgrenze)';
        if (refMin !== -Infinity && refMax !== Infinity) status += ` [Ref: ${refMin}–${refMax}]`;
      }
      context += `- ${val.name}: ${val.comparator ?? ''}${val.value} ${val.unit}${status}\n`;
    }
    context += '\n';
  }

  return context;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

const GEMINI_DEFAULT_BASE = 'https://generativelanguage.googleapis.com/v1beta';

// Keys aus .env-Dateien tragen oft Anführungszeichen oder Zeilenumbrüche mit sich,
// die Google unverändert als ungültigen Key ablehnt.
function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^['"]|['"]$/g, '');
}

function geminiFetch(model: string, apiKey: string, baseUrl: string | undefined, body: unknown) {
  const base = (baseUrl || GEMINI_DEFAULT_BASE).replace(/\/$/, '');
  return fetch(`${base}/models/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify(body),
  });
}

async function geminiError(response: Response): Promise<Error> {
  const raw = await response.text();
  let message = '';
  let reason = '';
  try {
    const parsed = JSON.parse(raw) as {
      error?: { message?: string; details?: Array<{ reason?: string }> };
    };
    message = parsed.error?.message ?? '';
    reason = parsed.error?.details?.find((d) => d.reason)?.reason ?? '';
  } catch {
    // Antwort war kein JSON – Rohtext verwenden
  }

  if (reason === 'API_KEY_INVALID' || /api key not valid/i.test(message)) {
    return new Error(
      'Der hinterlegte Gemini-API-Key ist ungültig. Bitte LLM_API_KEY in der Server-Konfiguration prüfen (Google AI Studio → API Key).'
    );
  }
  if (response.status === 403) {
    return new Error(
      'Der Gemini-API-Key hat keinen Zugriff auf die Generative Language API. Bitte die Berechtigungen des Keys prüfen.'
    );
  }
  if (response.status === 429) {
    return new Error('Das Gemini-Kontingent ist derzeit erschöpft. Bitte später erneut versuchen.');
  }
  return new Error(`Gemini API error ${response.status}: ${message || raw}`);
}

async function callGemini(
  messages: LLMMessage[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseUrl?: string,
  temperature = 0.7
): Promise<string> {
  const key = normalizeApiKey(apiKey);
  if (!key) throw new Error('LLM_API_KEY ist nicht konfiguriert.');

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature,
      maxOutputTokens: 8192,
    },
  };

  const response = await geminiFetch(model, key, baseUrl, body);

  if (!response.ok) {
    throw await geminiError(response);
  }

  const data = await response.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ─── OpenAI (and compatible) ──────────────────────────────────────────────────

async function callOpenAI(
  messages: LLMMessage[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseUrl = 'https://api.openai.com/v1',
  temperature = 0.7
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages: allMessages, max_tokens: 4096, temperature }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message: { content: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content ?? '';
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

async function callAnthropic(
  messages: LLMMessage[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  temperature = 0.7
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: 4096,
      temperature,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    content?: Array<{ text: string }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Anthropic error: ${data.error.message}`);
  return data.content?.[0]?.text ?? '';
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

async function callOllama(
  messages: LLMMessage[],
  systemPrompt: string,
  model: string,
  baseUrl = 'http://localhost:11434',
  temperature = 0.7
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: allMessages, stream: false, options: { temperature } }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Ollama API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    message?: { content: string };
    error?: string;
  };

  if (data.error) throw new Error(`Ollama error: ${data.error}`);
  return data.message?.content ?? '';
}

// ─── Provider-neutraler Aufruf ────────────────────────────────────────────────

export async function callLLM(
  messages: LLMMessage[],
  systemPrompt: string,
  temperature = 0.7
): Promise<string> {
  const config = getConfig();

  switch (config.LLM_PROVIDER) {
    case 'gemini':
      return callGemini(
        messages,
        systemPrompt,
        config.LLM_MODEL,
        config.LLM_API_KEY || '',
        config.LLM_API_URL,
        temperature
      );

    case 'openai':
      return callOpenAI(
        messages,
        systemPrompt,
        config.LLM_MODEL,
        config.LLM_API_KEY || '',
        'https://api.openai.com/v1',
        temperature
      );

    case 'openai_compatible':
      return callOpenAI(
        messages,
        systemPrompt,
        config.LLM_MODEL,
        config.LLM_API_KEY || '',
        config.LLM_API_URL || 'http://localhost:8080/v1',
        temperature
      );

    case 'anthropic':
      return callAnthropic(
        messages,
        systemPrompt,
        config.LLM_MODEL,
        config.LLM_API_KEY || '',
        temperature
      );

    case 'ollama':
      return callOllama(
        messages,
        systemPrompt,
        config.LLM_MODEL,
        config.LLM_API_URL || 'http://localhost:11434',
        temperature
      );

    default:
      throw new Error(`Unknown LLM provider: ${config.LLM_PROVIDER}`);
  }
}

// ─── Main Chat Function ───────────────────────────────────────────────────────

export async function chat(
  messages: LLMMessage[],
  userData: UserData
): Promise<LLMResponse> {
  const userContext = buildUserContext(userData);
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\nKontext - Aktuelle Nutzerdaten:\n${userContext}`;

  try {
    const content = await callLLM(messages, fullSystemPrompt);
    return { content };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('LLM error:', msg);
    return {
      content: '',
      error: `KI-Doktor ist momentan nicht verfügbar: ${msg}`,
    };
  }
}

// ─── Blood Test Scan Analysis ─────────────────────────────────────────────────

const SCAN_PROMPT = `Du bist ein Experte für die Analyse von Laborberichten. Extrahiere ALLE Blutwerte aus dem Bild/Dokument.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt im folgenden Format (kein Markdown, kein Text drumherum):
{
  "date": "YYYY-MM-DD oder null wenn nicht erkennbar",
  "lab_name": "Name des Labors oder null wenn nicht erkennbar",
  "values": [
    { "name": "Bezeichnung des Wertes", "value": 123.4, "unit": "Einheit", "comparator": "<" }
  ]
}

Wichtige Regeln:
- "value" muss immer eine Zahl sein (kein Text)
- Steht auf dem Befund "<5" oder "> 200", gehört die Zahl in "value" und das
  Zeichen in "comparator"; sonst lasse "comparator" weg
- Verwende die exakte Bezeichnung wie sie auf dem Laborbericht steht
- Extrahiere ALLE sichtbaren Werte, auch wenn sie im Normalbereich liegen
- Bei Kommazahlen verwende einen Punkt als Dezimaltrenner
- Ignoriere Referenzbereiche, extrahiere nur die gemessenen Werte
- Erfasse auch handschriftlich ergänzte Werte
- Ein Dokument kann mehrere Befunde enthalten – werte alle Seiten aus
- Wenn das Bild keinen Laborbericht zeigt, antworte mit: { "values": [], "error": "Kein Laborbericht erkannt" }`;

interface RawScanValue {
  name: string;
  value: number | string;
  unit?: string;
  comparator?: string;
}

/**
 * Trennt eine Bestimmungsgrenze vom Zahlenwert. Das Modell liefert sie in
 * "comparator", schreibt sie gelegentlich aber auch in "value" ("<5").
 */
function splitComparator(raw: RawScanValue): { value: number; comparator?: ValueComparator } {
  const text = String(raw.value).trim();
  const inValue = text.match(/^([<>])\s*(.+)$/);

  const sign = (inValue?.[1] ?? raw.comparator ?? '').trim();
  const value = Number(String(inValue?.[2] ?? text).replace(',', '.'));

  return sign === '<' || sign === '>'
    ? { value, comparator: sign }
    : { value };
}

function matchAndEnrichValues(rawValues: RawScanValue[]): ExtractedBloodValue[] {
  return rawValues.flatMap((raw) => {
    const { value, comparator } = splitComparator(raw);
    if (!Number.isFinite(value)) return [];

    const ref = matchReferenceValue(raw.name);
    if (ref) {
      return [{
        name: ref.name,
        value,
        ...(comparator ? { comparator } : {}),
        unit: raw.unit || ref.unit,
        category: ref.category,
        short_name: ref.short_name,
        long_name: ref.long_name,
        ref_id: ref.id,
      }];
    }

    // Unbekannte Bezeichnung unverändert übernehmen – lieber ohne Referenz als
    // unter falschem Namen (Holotranscobalamin ist kein Vitamin B12).
    return [{
      name: raw.name,
      value,
      ...(comparator ? { comparator } : {}),
      unit: raw.unit ?? '',
    }];
  });
}

// ─── Scan-Import: Bild/PDF an das jeweilige Modell schicken ──────────────────

async function scanWithGemini(
  base64Data: string,
  mimeType: string,
  model: string,
  apiKey: string,
  baseUrl: string | undefined
): Promise<string> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: SCAN_PROMPT },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192,
    },
  };

  const response = await geminiFetch(model, apiKey, baseUrl, body);

  if (!response.ok) {
    throw await geminiError(response);
  }

  const data = await response.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// OpenAI-Chat-Completions-Format, das auch OpenRouter versteht: Bilder als
// image_url-Data-URI, PDFs als file-Part.
async function scanWithOpenAI(
  base64Data: string,
  mimeType: string,
  model: string,
  apiKey: string,
  baseUrl: string
): Promise<string> {
  const dataUri = `data:${mimeType};base64,${base64Data}`;
  const filePart = mimeType === 'application/pdf'
    ? { type: 'file', file: { filename: 'laborbefund.pdf', file_data: dataUri } }
    : { type: 'image_url', image_url: { url: dataUri } };

  const response = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [filePart, { type: 'text', text: SCAN_PROMPT }] }],
      max_tokens: 8192,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message: { content: string } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`);
  return data.choices?.[0]?.message?.content ?? '';
}

async function scanWithAnthropic(
  base64Data: string,
  mimeType: string,
  model: string,
  apiKey: string
): Promise<string> {
  const source = { type: 'base64', media_type: mimeType, data: base64Data };
  const filePart = mimeType === 'application/pdf'
    ? { type: 'document', source }
    : { type: 'image', source };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: [filePart, { type: 'text', text: SCAN_PROMPT }] }],
      max_tokens: 8192,
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Anthropic API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    content?: Array<{ text: string }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Anthropic error: ${data.error.message}`);
  return data.content?.[0]?.text ?? '';
}

export async function analyzeBloodTestImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ScanResult> {
  const config = getConfig();

  const apiKey = normalizeApiKey(config.LLM_API_KEY || '');
  if (!apiKey) throw new Error('LLM_API_KEY ist nicht konfiguriert.');

  const base64Data = imageBuffer.toString('base64');

  let text: string;
  switch (config.LLM_PROVIDER) {
    case 'gemini':
      text = await scanWithGemini(
        base64Data, mimeType, config.LLM_MODEL || 'gemini-2.5-flash', apiKey, config.LLM_API_URL
      );
      break;
    case 'openai':
      text = await scanWithOpenAI(base64Data, mimeType, config.LLM_MODEL, apiKey, 'https://api.openai.com/v1');
      break;
    case 'openai_compatible':
      text = await scanWithOpenAI(
        base64Data, mimeType, config.LLM_MODEL, apiKey, config.LLM_API_URL || 'http://localhost:8080/v1'
      );
      break;
    case 'anthropic':
      text = await scanWithAnthropic(base64Data, mimeType, config.LLM_MODEL, apiKey);
      break;
    default:
      throw new Error(`Scan-Import ist mit dem Provider "${config.LLM_PROVIDER}" nicht verfügbar.`);
  }

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed: { date?: string; lab_name?: string; values?: RawScanValue[]; error?: string };
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error('KI-Antwort konnte nicht als JSON interpretiert werden.');
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.values || !Array.isArray(parsed.values)) {
    throw new Error('Keine Blutwerte im Scan erkannt.');
  }

  const enrichedValues = matchAndEnrichValues(parsed.values);

  return {
    date: parsed.date ?? undefined,
    lab_name: parsed.lab_name ?? undefined,
    values: enrichedValues,
  };
}
