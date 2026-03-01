import 'express-session';

// ─── Gender ──────────────────────────────────────────────────────────────────

export type Gender = 'male' | 'female';

// ─── Blood Values ──────────────────────────────────────────────────────────────

export interface BloodValue {
  name: string;
  value: number;
  unit: string;
  category: string;
  short_name?: string;
  long_name?: string;
}

export interface BloodEntry {
  id: string;
  date: string; // ISO date string YYYY-MM-DD
  lab_name?: string;
  notes?: string;
  values: BloodValue[];
}

export interface ApiToken {
  id: string;
  name: string;
  token: string;
  created_at: string; // ISO timestamp
}

export interface UserData {
  user_id: string;
  display_name: string;
  email: string;
  gender?: Gender;
  entries: BloodEntry[];
  api_tokens?: ApiToken[];
}

// ─── Chat ─────────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

export interface ChatHistory {
  user_id: string;
  messages: ChatMessage[];
}

// ─── Reference Values ─────────────────────────────────────────────────────────

export interface ReferenceValue {
  id: string;
  name: string;
  short_name?: string;
  long_name?: string;
  aliases: string[];
  category: string;
  unit: string;
  ref_min?: number;
  ref_max?: number;
  ref_min_female?: number;
  ref_max_female?: number;
  ref_min_male?: number;
  ref_max_male?: number;
  optimal_min?: number;
  optimal_max?: number;
  critical_low?: number;
  critical_high?: number;
  description: string;
  high_info: string;
  low_info: string;
  recommendations: string;
}

export interface ReferenceDatabase {
  version: string;
  updated: string;
  values: ReferenceValue[];
}

// ─── Value Status ─────────────────────────────────────────────────────────────

export type ValueStatus = 'normal' | 'warning' | 'high' | 'low' | 'critical_high' | 'critical_low' | 'unknown';

// ─── Session ──────────────────────────────────────────────────────────────────

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    displayName?: string;
    email?: string;
    oidcState?: string;
    oidcCodeVerifier?: string;
    oidcNonce?: string;
  }
}

// ─── Scan Import ──────────────────────────────────────────────────────────────

export interface ExtractedBloodValue {
  name: string;
  value: number;
  unit: string;
  category?: string;
  short_name?: string;
  long_name?: string;
  ref_id?: string; // matched reference_values.json ID
}

export interface ScanResult {
  date?: string;
  lab_name?: string;
  values: ExtractedBloodValue[];
}

// ─── LLM ──────────────────────────────────────────────────────────────────────

export interface LLMMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  error?: string;
}
