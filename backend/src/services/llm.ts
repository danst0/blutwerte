import { getConfig } from '../config';
import type { Gender, LLMMessage, LLMResponse, UserData, ReferenceValue, ExtractedBloodValue, ScanResult } from '../types';
import { findReferenceValue, getReferenceDatabase } from './fileStore';

const SYSTEM_PROMPT = `Du bist ein hilfreicher medizinischer Assistent, der Blutwerte erklärt und einordnet.
Du hast Zugriff auf die Blutwerte des Nutzers und kannst Trends analysieren.
Antworte auf Deutsch, verständlich und einfühlsam.
Gib IMMER am Ende deiner Antwort den Hinweis, dass deine Aussagen keine ärztliche Diagnose ersetzen und bei gesundheitlichen Bedenken ein Arzt aufgesucht werden sollte.
Wenn Werte kritisch außerhalb des Referenzbereichs liegen, empfiehl dringend einen zeitnahen Arztbesuch.
Beziehe dich auf die konkreten Werte des Nutzers, wenn relevant.
Formatiere deine Antworten übersichtlich mit Markdown.`;

function getEffectiveRange(ref: ReferenceValue, gender?: Gender): { min: number; max: number } {
  let min = ref.ref_min ?? -Infinity;
  let max = ref.ref_max ?? Infinity;

  if (gender === 'female') {
    if (ref.ref_min_female !== undefined) min = ref.ref_min_female;
    if (ref.ref_max_female !== undefined) max = ref.ref_max_female;
  } else if (gender === 'male') {
    if (ref.ref_min_male !== undefined) min = ref.ref_min_male;
    if (ref.ref_max_male !== undefined) max = ref.ref_max_male;
  }

  return { min, max };
}

function buildUserContext(userData: UserData): string {
  if (userData.entries.length === 0) {
    return 'Der Nutzer hat noch keine Blutwerte eingetragen.';
  }

  const gender = userData.gender;
  const recent = userData.entries
    .slice()
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  let context = `Blutwerte von ${userData.display_name}`;
  if (gender) context += ` (${gender === 'male' ? 'männlich' : 'weiblich'})`;
  context += `:\n\n`;

  for (const entry of recent) {
    context += `**Eintrag vom ${entry.date}`;
    if (entry.lab_name) context += ` (${entry.lab_name})`;
    context += `:**\n`;

    for (const val of entry.values) {
      const ref = findReferenceValue(val.name);
      let status = '';
      if (ref) {
        const { min: refMin, max: refMax } = getEffectiveRange(ref, gender);
        if (val.value < refMin) status = ' ⬇ UNTER Referenzbereich';
        else if (val.value > refMax) status = ' ⬆ ÜBER Referenzbereich';
        else status = ' ✓ Normal';
        if (ref.critical_low !== undefined && val.value <= ref.critical_low) status = ' 🚨 KRITISCH NIEDRIG';
        if (ref.critical_high !== undefined && val.value >= ref.critical_high) status = ' 🚨 KRITISCH HOCH';
        const rangeStr = refMin !== -Infinity && refMax !== Infinity ? ` [Ref: ${refMin}–${refMax}]` : '';
        status += rangeStr;
      }
      context += `- ${val.name}: ${val.value} ${val.unit}${status}\n`;
    }
    context += '\n';
  }

  return context;
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

async function callGemini(
  messages: LLMMessage[],
  systemPrompt: string,
  model: string,
  apiKey: string,
  baseUrl?: string
): Promise<string> {
  const base = (baseUrl || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const url = `${base}/models/${model}:generateContent?key=${apiKey}`;

  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4096,
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
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
  baseUrl = 'https://api.openai.com/v1'
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
    body: JSON.stringify({ model, messages: allMessages, max_tokens: 4096 }),
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
  apiKey: string
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
  baseUrl = 'http://localhost:11434'
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`;

  const allMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: allMessages, stream: false }),
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

// ─── Main Chat Function ───────────────────────────────────────────────────────

export async function chat(
  messages: LLMMessage[],
  userData: UserData
): Promise<LLMResponse> {
  const config = getConfig();

  const userContext = buildUserContext(userData);
  const fullSystemPrompt = `${SYSTEM_PROMPT}\n\n---\nKontext - Aktuelle Nutzerdaten:\n${userContext}`;

  try {
    let content = '';

    switch (config.LLM_PROVIDER) {
      case 'gemini':
        content = await callGemini(
          messages,
          fullSystemPrompt,
          config.LLM_MODEL,
          config.LLM_API_KEY || '',
          config.LLM_API_URL
        );
        break;

      case 'openai':
        content = await callOpenAI(
          messages,
          fullSystemPrompt,
          config.LLM_MODEL,
          config.LLM_API_KEY || '',
          'https://api.openai.com/v1'
        );
        break;

      case 'openai_compatible':
        content = await callOpenAI(
          messages,
          fullSystemPrompt,
          config.LLM_MODEL,
          config.LLM_API_KEY || '',
          config.LLM_API_URL || 'http://localhost:8080/v1'
        );
        break;

      case 'anthropic':
        content = await callAnthropic(
          messages,
          fullSystemPrompt,
          config.LLM_MODEL,
          config.LLM_API_KEY || ''
        );
        break;

      case 'ollama':
        content = await callOllama(
          messages,
          fullSystemPrompt,
          config.LLM_MODEL,
          config.LLM_API_URL || 'http://localhost:11434'
        );
        break;

      default:
        throw new Error(`Unknown LLM provider: ${config.LLM_PROVIDER}`);
    }

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
    { "name": "Bezeichnung des Wertes", "value": 123.4, "unit": "Einheit" }
  ]
}

Wichtige Regeln:
- "value" muss immer eine Zahl sein (kein Text)
- Verwende die exakte Bezeichnung wie sie auf dem Laborbericht steht
- Extrahiere ALLE sichtbaren Werte, auch wenn sie im Normalbereich liegen
- Bei Kommazahlen verwende einen Punkt als Dezimaltrenner
- Ignoriere Referenzbereiche, extrahiere nur die gemessenen Werte
- Wenn das Bild keinen Laborbericht zeigt, antworte mit: { "values": [], "error": "Kein Laborbericht erkannt" }`;

function matchAndEnrichValues(rawValues: Array<{ name: string; value: number; unit: string }>): ExtractedBloodValue[] {
  const db = getReferenceDatabase();

  return rawValues.map((raw) => {
    const ref = findReferenceValue(raw.name);
    if (ref) {
      return {
        name: ref.name,
        value: raw.value,
        unit: raw.unit || ref.unit,
        category: ref.category,
        short_name: ref.short_name,
        long_name: ref.long_name,
        ref_id: ref.id,
      };
    }

    // Try fuzzy match: check if any reference value's name/alias is contained
    const lower = raw.name.toLowerCase();
    const fuzzy = db.values.find(
      (v) =>
        lower.includes(v.name.toLowerCase()) ||
        v.name.toLowerCase().includes(lower) ||
        v.aliases.some((a) => lower.includes(a.toLowerCase()) || a.toLowerCase().includes(lower))
    );

    if (fuzzy) {
      return {
        name: fuzzy.name,
        value: raw.value,
        unit: raw.unit || fuzzy.unit,
        category: fuzzy.category,
        short_name: fuzzy.short_name,
        long_name: fuzzy.long_name,
        ref_id: fuzzy.id,
      };
    }

    return {
      name: raw.name,
      value: raw.value,
      unit: raw.unit,
    };
  });
}

export async function analyzeBloodTestImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<ScanResult> {
  const config = getConfig();

  if (config.LLM_PROVIDER !== 'gemini') {
    throw new Error('Scan-Import ist nur mit dem Gemini-Provider verfügbar.');
  }

  const apiKey = config.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY ist nicht konfiguriert.');

  const base = (config.LLM_API_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const model = config.LLM_MODEL || 'gemini-2.5-flash';
  const url = `${base}/models/${model}:generateContent?key=${apiKey}`;

  const base64Data = imageBuffer.toString('base64');

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
    error?: { message: string };
  };

  if (data.error) throw new Error(`Gemini error: ${data.error.message}`);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  // Parse JSON from response (handle markdown code blocks)
  let jsonStr = text.trim();
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  let parsed: { date?: string; lab_name?: string; values?: Array<{ name: string; value: number; unit: string }>; error?: string };
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
