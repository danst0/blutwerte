import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { tokens as tokensApi, user as userApi } from '@/lib/api';
import type { ApiToken, ApiTokenCreated, Gender } from '@/types';
import { Key, Plus, Trash2, Copy, Check, User } from 'lucide-react';

export default function Profile() {
  const { user, refetch } = useAuth();
  const [tokenList, setTokenList] = useState<ApiToken[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newToken, setNewToken] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingGender, setSavingGender] = useState(false);

  useEffect(() => {
    tokensApi.list().then(setTokenList).catch(() => setTokenList([]));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTokenName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await tokensApi.create(newTokenName.trim());
      setTokenList((prev) => [...prev, { id: created.id, name: created.name, created_at: created.created_at }]);
      setNewToken(created);
      setNewTokenName('');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen des Tokens');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await tokensApi.delete(id);
      setTokenList((prev) => prev.filter((t) => t.id !== id));
      if (newToken?.id === id) setNewToken(null);
    } catch {
      setError('Fehler beim Löschen des Tokens');
    }
  }

  async function handleGenderChange(gender: Gender) {
    setSavingGender(true);
    try {
      await userApi.updateProfile({ gender });
      await refetch();
    } catch {
      setError('Fehler beim Speichern des Geschlechts');
    } finally {
      setSavingGender(false);
    }
  }

  async function handleCopy() {
    if (!newToken) return;
    await navigator.clipboard.writeText(newToken.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Profil</h1>

      {/* User Info */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <User className="w-7 h-7 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">{user?.displayName}</p>
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</p>
          </div>
        </div>
      </section>

      {/* Gender Selection */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Geschlecht</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Beeinflusst die Referenzbereiche für geschlechtsspezifische Blutwerte (z.B. Hämoglobin, Hämatokrit, Erythrozyten).
        </p>
        <div className="flex gap-3">
          {([
            { value: 'male' as Gender, label: 'Männlich' },
            { value: 'female' as Gender, label: 'Weiblich' },
          ]).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleGenderChange(value)}
              disabled={savingGender}
              className={`flex-1 px-4 py-3 rounded-lg border-2 text-sm font-medium transition-colors ${
                user?.gender === value
                  ? 'border-blue-600 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
              } disabled:opacity-50`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* API Tokens */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">API-Tokens</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tokens ermöglichen API-Zugriff ohne Browser-Session, z.B. für Import-Skripte.
          Verwende den Header <code className="bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-xs">Authorization: Bearer &lt;token&gt;</code>.
        </p>

        {/* One-time token display */}
        {newToken && (
          <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4 space-y-2">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              ✓ Token erstellt – wird nur einmalig angezeigt:
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white dark:bg-gray-900 border border-green-200 dark:border-green-800 rounded px-3 py-2 font-mono break-all text-gray-900 dark:text-gray-100">
                {newToken.token}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-2 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 text-green-700 dark:text-green-400 transition-colors"
                title="Kopieren"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Token list */}
        {tokenList.length > 0 && (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {tokenList.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{t.name}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Erstellt {new Date(t.created_at).toLocaleDateString('de-DE')}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(t.id)}
                  className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  title="Token widerrufen"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {tokenList.length === 0 && !newToken && (
          <p className="text-sm text-gray-400 dark:text-gray-500">Noch keine Tokens vorhanden.</p>
        )}

        {/* Create form */}
        {tokenList.length < 10 && (
          <form onSubmit={handleCreate} className="flex gap-2 pt-2">
            <input
              type="text"
              value={newTokenName}
              onChange={(e) => setNewTokenName(e.target.value)}
              placeholder="Token-Name (z.B. Import-Skript)"
              className="flex-1 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              maxLength={100}
            />
            <button
              type="submit"
              disabled={creating || !newTokenName.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="w-4 h-4" />
              Erstellen
            </button>
          </form>
        )}
        {tokenList.length >= 10 && (
          <p className="text-xs text-gray-400 dark:text-gray-500">Maximale Anzahl von 10 Tokens erreicht.</p>
        )}
      </section>
    </div>
  );
}
