import type { AuthUser, UserData, BloodEntry, ReferenceDatabase, ReferenceValue, ChatHistory, ChatMessage, ValueHistory, ApiToken, ApiTokenCreated } from '@/types';

const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    const error = new Error(body.message || body.error || `HTTP ${res.status}`);
    (error as ApiError).status = res.status;
    (error as ApiError).body = body;
    throw error;
  }

  return res.json();
}

export interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const auth = {
  me: () => request<AuthUser>('/auth/me'),
  login: () => { window.location.href = `${BASE}/auth/login`; },
  logout: () => { window.location.href = `${BASE}/auth/logout`; },
};

// ─── Blood Values ─────────────────────────────────────────────────────────────

export const bloodValues = {
  getAll: () => request<UserData>('/bloodvalues'),

  create: (entry: Omit<BloodEntry, 'id'>) =>
    request<BloodEntry>('/bloodvalues', {
      method: 'POST',
      body: JSON.stringify(entry),
    }),

  update: (id: string, entry: Omit<BloodEntry, 'id'>) =>
    request<BloodEntry>(`/bloodvalues/${id}`, {
      method: 'PUT',
      body: JSON.stringify(entry),
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/bloodvalues/${id}`, { method: 'DELETE' }),

  getHistory: (valueName: string) =>
    request<ValueHistory>(`/bloodvalues/history/${encodeURIComponent(valueName)}`),
};

// ─── Reference ────────────────────────────────────────────────────────────────

export const reference = {
  getAll: () => request<ReferenceDatabase>('/reference'),

  getCategories: () => request<string[]>('/reference/categories'),

  search: (q: string) => request<ReferenceValue[]>(`/reference/search?q=${encodeURIComponent(q)}`),

  getByName: (name: string) => request<ReferenceValue>(`/reference/${encodeURIComponent(name)}`),
};

// ─── API Tokens ───────────────────────────────────────────────────────────────

export const tokens = {
  list: () => request<ApiToken[]>('/tokens'),

  create: (name: string) =>
    request<ApiTokenCreated>('/tokens', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/tokens/${id}`, { method: 'DELETE' }),
};

// ─── Admin Reference ──────────────────────────────────────────────────────────

export const adminReference = {
  getAll: () => request<ReferenceDatabase>('/admin/reference'),

  create: (value: Omit<ReferenceValue, 'id'>) =>
    request<ReferenceValue>('/admin/reference', {
      method: 'POST',
      body: JSON.stringify(value),
    }),

  update: (id: string, value: ReferenceValue) =>
    request<ReferenceValue>(`/admin/reference/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(value),
    }),

  delete: (id: string) =>
    request<{ success: boolean }>(`/admin/reference/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

// ─── AI ───────────────────────────────────────────────────────────────────────

export const ai = {
  getHistory: () => request<ChatHistory>('/ai/history'),

  clearHistory: () => request<{ success: boolean }>('/ai/history', { method: 'DELETE' }),

  chat: (message: string) =>
    request<{ message: ChatMessage; userMessage: ChatMessage }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
};
