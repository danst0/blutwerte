import { getConfig } from '../config';
import type { Gender, LLMMessage, LLMResponse, UserData, ReferenceValue } from '../types';
import { findReferenceValue } from './fileStore';

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
