import fs from 'fs';
import path from 'path';
import { getConfig } from '../config';
import type { UserData, ChatHistory, ChatMessage, ReferenceDatabase, ReferenceValue, ApiToken } from '../types';

function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function readJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

function writeJSON(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath);
  ensureDir(dir);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getUserDir(userId: string): string {
  const config = getConfig();
  // Sanitize userId to prevent path traversal
  const safeId = userId.replace(/[^a-zA-Z0-9_\-\.@]/g, '_');
  return path.join(config.DATA_DIR, 'users', safeId);
}

// ─── User Blood Values ────────────────────────────────────────────────────────

export function getUserData(userId: string): UserData {
  const filePath = path.join(getUserDir(userId), 'bloodvalues.json');
  return readJSON<UserData>(filePath, {
    user_id: userId,
    display_name: '',
    email: '',
    entries: [],
  });
}

export function saveUserData(data: UserData): void {
  const filePath = path.join(getUserDir(data.user_id), 'bloodvalues.json');
  writeJSON(filePath, data);
}

export function ensureUserProfile(
  userId: string,
  displayName: string,
  email: string
): UserData {
  const data = getUserData(userId);
  if (!data.display_name || !data.email) {
    data.display_name = displayName;
    data.email = email;
    data.user_id = userId;
    saveUserData(data);
  }
  return data;
}

// ─── API Tokens ───────────────────────────────────────────────────────────────

export function findUserByToken(token: string): string | null {
  const config = getConfig();
  const usersDir = path.join(config.DATA_DIR, 'users');
  if (!fs.existsSync(usersDir)) return null;

  for (const userDir of fs.readdirSync(usersDir)) {
    const filePath = path.join(usersDir, userDir, 'bloodvalues.json');
    const data = readJSON<UserData>(filePath, { user_id: '', display_name: '', email: '', entries: [] });
    if (data.api_tokens?.some((t) => t.token === token)) {
      return data.user_id;
    }
  }
  return null;
}

// ─── Chat History ─────────────────────────────────────────────────────────────

export function getChatHistory(userId: string): ChatHistory {
  const filePath = path.join(getUserDir(userId), 'chat_history.json');
  return readJSON<ChatHistory>(filePath, {
    user_id: userId,
    messages: [],
  });
}

export function saveChatHistory(userId: string, history: ChatHistory): void {
  const filePath = path.join(getUserDir(userId), 'chat_history.json');
  // Keep only last 100 messages to prevent unbounded growth
  if (history.messages.length > 100) {
    history.messages = history.messages.slice(-100);
  }
  writeJSON(filePath, history);
}

export function appendChatMessage(userId: string, message: ChatMessage): void {
  const history = getChatHistory(userId);
  history.messages.push(message);
  saveChatHistory(userId, history);
}

// ─── Reference Values ─────────────────────────────────────────────────────────

let _referenceCache: ReferenceDatabase | null = null;

const EMPTY_DB: ReferenceDatabase = { version: '1.0', updated: '', values: [] };

/**
 * Load the built-in reference values baked into the Docker image.
 * Falls back to ../data/reference_values.json for local development.
 */
function getBuiltinReferenceDatabase(): ReferenceDatabase {
  // Docker image path
  const imagePath = path.resolve('/app/defaults/reference_values.json');
  if (fs.existsSync(imagePath)) {
    return readJSON<ReferenceDatabase>(imagePath, EMPTY_DB);
  }
  // Dev fallback: relative to backend cwd
  const devPath = path.join(process.cwd(), '..', 'data', 'reference_values.json');
  if (fs.existsSync(devPath)) {
    return readJSON<ReferenceDatabase>(devPath, EMPTY_DB);
  }
  console.warn('Built-in reference_values.json not found');
  return EMPTY_DB;
}

/**
 * Load user overrides from the data directory.
 */
function getOverrides(): ReferenceDatabase | null {
  const config = getConfig();
  const filePath = path.join(config.DATA_DIR, 'reference_overrides.json');
  if (!fs.existsSync(filePath)) return null;
  return readJSON<ReferenceDatabase | null>(filePath, null);
}

/**
 * Merge built-in values with overrides. Override values replace built-in by id;
 * new values are appended.
 */
function mergeReferences(builtin: ReferenceDatabase, overrides: ReferenceDatabase): ReferenceDatabase {
  const merged = new Map<string, ReferenceValue>();
  for (const v of builtin.values) merged.set(v.id, v);
  for (const v of overrides.values) merged.set(v.id, v);

  return {
    version: builtin.version,
    updated: overrides.updated || builtin.updated,
    values: Array.from(merged.values()),
  };
}

export function getReferenceDatabase(): ReferenceDatabase {
  if (_referenceCache) return _referenceCache;

  const builtin = getBuiltinReferenceDatabase();
  const overrides = getOverrides();
  _referenceCache = overrides ? mergeReferences(builtin, overrides) : builtin;

  return _referenceCache;
}

export function findReferenceValue(name: string): ReferenceValue | undefined {
  const db = getReferenceDatabase();
  const lower = name.toLowerCase();
  return db.values.find(
    (v) =>
      v.name.toLowerCase() === lower ||
      v.aliases.some((a) => a.toLowerCase() === lower)
  );
}

/**
 * Save the full merged database. Computes diff against built-in and persists
 * only the values that differ (overrides) in reference_overrides.json.
 */
export function saveReferenceDatabase(db: ReferenceDatabase): void {
  const config = getConfig();
  const builtin = getBuiltinReferenceDatabase();
  const builtinMap = new Map(builtin.values.map((v) => [v.id, v]));

  // Keep only values that differ from built-in or are new
  const overrideValues = db.values.filter((v) => {
    const b = builtinMap.get(v.id);
    return !b || JSON.stringify(b) !== JSON.stringify(v);
  });

  if (overrideValues.length > 0) {
    const overridesDb: ReferenceDatabase = {
      version: 'overrides',
      updated: new Date().toISOString().split('T')[0],
      values: overrideValues,
    };
    const filePath = path.join(config.DATA_DIR, 'reference_overrides.json');
    writeJSON(filePath, overridesDb);
  } else {
    // No overrides needed — remove file if it exists
    const filePath = path.join(config.DATA_DIR, 'reference_overrides.json');
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  _referenceCache = db;
}

export function updateReferenceVersion(db: ReferenceDatabase): ReferenceDatabase {
  return { ...db, updated: new Date().toISOString().split('T')[0] };
}

export function searchReferenceValues(query: string): ReferenceValue[] {
  const db = getReferenceDatabase();
  const lower = query.toLowerCase();
  return db.values.filter(
    (v) =>
      v.name.toLowerCase().includes(lower) ||
      v.aliases.some((a) => a.toLowerCase().includes(lower)) ||
      v.category.toLowerCase().includes(lower)
  );
}

// ─── Rate Limiting (AI requests) ──────────────────────────────────────────────

interface RateRecord {
  count: number;
  resetAt: number; // unix timestamp ms
}

const aiRateLimitFile = (): string => {
  const config = getConfig();
  return path.join(config.DATA_DIR, 'ai_rate_limits.json');
};

export function checkAndIncrementAIRate(userId: string, maxPerDay = 50): boolean {
  const filePath = aiRateLimitFile();
  const records = readJSON<Record<string, RateRecord>>(filePath, {});

  const now = Date.now();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const record = records[userId];

  if (!record || now > record.resetAt) {
    // New day
    records[userId] = { count: 1, resetAt: todayEnd.getTime() };
    writeJSON(filePath, records);
    return true;
  }

  if (record.count >= maxPerDay) {
    return false;
  }

  records[userId].count++;
  writeJSON(filePath, records);
  return true;
}
