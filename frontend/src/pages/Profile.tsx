import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { tokens as tokensApi, user as userApi } from '@/lib/api';
import type { ApiToken, ApiTokenCreated, Gender, Lifestyle, SmokingStatus, AlcoholConsumption, ExerciseLevel, DietType, StressLevel } from '@/types';
import { Key, Plus, Trash2, Copy, Check, User, X, Stethoscope, Pill, Heart } from 'lucide-react';

// ─── Tag Input Component ──────────────────────────────────────────────────────

function TagInput({
  tags,
  onChange,
  placeholder,
  saving,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
  saving: boolean;
}) {
  const [input, setInput] = useState('');

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const value = input.trim();
      if (!tags.includes(value)) {
        onChange([...tags, value]);
      }
      setInput('');
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  function handleRemove(index: number) {
    onChange(tags.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-wrap gap-2 p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 min-h-[48px] items-center">
      {tags.map((tag, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm"
        >
          {tag}
          <button
            type="button"
            onClick={() => handleRemove(i)}
            disabled={saving}
            className="hover:text-blue-900 dark:hover:text-blue-100 disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={tags.length === 0 ? placeholder : ''}
        disabled={saving}
        className="flex-1 min-w-[120px] text-sm bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 placeholder-gray-400 disabled:opacity-50"
      />
    </div>
  );
}

// ─── Lifestyle Select Component ───────────────────────────────────────────────

function LifestyleSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | undefined;
  options: { value: T; label: string }[];
  onChange: (value: T | undefined) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? (e.target.value as T) : undefined)}
        disabled={disabled}
        className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value="">– Nicht angegeben –</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Lifestyle Options ────────────────────────────────────────────────────────

const SMOKING_OPTIONS: { value: SmokingStatus; label: string }[] = [
  { value: 'never', label: 'Nichtraucher' },
  { value: 'former', label: 'Ex-Raucher' },
  { value: 'occasional', label: 'Gelegenheitsraucher' },
  { value: 'regular', label: 'Raucher' },
];

const ALCOHOL_OPTIONS: { value: AlcoholConsumption; label: string }[] = [
  { value: 'never', label: 'Kein Alkohol' },
  { value: 'rarely', label: 'Selten' },
  { value: 'moderate', label: 'Moderat' },
  { value: 'regular', label: 'Regelmäßig' },
];

const EXERCISE_OPTIONS: { value: ExerciseLevel; label: string }[] = [
  { value: 'none', label: 'Kein Sport' },
  { value: 'light', label: 'Leichte Aktivität (1-2x/Woche)' },
  { value: 'moderate', label: 'Moderate Aktivität (3-4x/Woche)' },
  { value: 'active', label: 'Aktiv (5+x/Woche)' },
  { value: 'very_active', label: 'Sehr aktiv (täglich intensiv)' },
];

const DIET_OPTIONS: { value: DietType; label: string }[] = [
  { value: 'mixed', label: 'Mischkost' },
  { value: 'vegetarian', label: 'Vegetarisch' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarisch' },
  { value: 'keto', label: 'Keto / Low-Carb' },
  { value: 'other', label: 'Andere' },
];

const STRESS_OPTIONS: { value: StressLevel; label: string }[] = [
  { value: 'low', label: 'Niedrig' },
  { value: 'moderate', label: 'Moderat' },
  { value: 'high', label: 'Hoch' },
  { value: 'very_high', label: 'Sehr hoch' },
];

// ─── Profile Page ─────────────────────────────────────────────────────────────

export default function Profile() {
  const { user, refetch } = useAuth();
  const [tokenList, setTokenList] = useState<ApiToken[]>([]);
  const [newTokenName, setNewTokenName] = useState('');
  const [newToken, setNewToken] = useState<ApiTokenCreated | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingGender, setSavingGender] = useState(false);
  const [savingDiagnoses, setSavingDiagnoses] = useState(false);
  const [savingMedications, setSavingMedications] = useState(false);
  const [savingLifestyle, setSavingLifestyle] = useState(false);

  // Local state for editable fields
  const [diagnoses, setDiagnoses] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [lifestyle, setLifestyle] = useState<Lifestyle>({});

  // Sync from user data
  useEffect(() => {
    if (user) {
      setDiagnoses(user.diagnoses ?? []);
      setMedications(user.medications ?? []);
      setLifestyle(user.lifestyle ?? {});
    }
  }, [user]);

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

  const handleDiagnosesChange = useCallback(async (newDiagnoses: string[]) => {
    setDiagnoses(newDiagnoses);
    setSavingDiagnoses(true);
    try {
      await userApi.updateProfile({ diagnoses: newDiagnoses });
      await refetch();
    } catch {
      setError('Fehler beim Speichern der Diagnosen');
    } finally {
      setSavingDiagnoses(false);
    }
  }, [refetch]);

  const handleMedicationsChange = useCallback(async (newMedications: string[]) => {
    setMedications(newMedications);
    setSavingMedications(true);
    try {
      await userApi.updateProfile({ medications: newMedications });
      await refetch();
    } catch {
      setError('Fehler beim Speichern der Medikamente');
    } finally {
      setSavingMedications(false);
    }
  }, [refetch]);

  const handleLifestyleChange = useCallback(async (newLifestyle: Lifestyle) => {
    setLifestyle(newLifestyle);
    setSavingLifestyle(true);
    try {
      await userApi.updateProfile({ lifestyle: newLifestyle });
      await refetch();
    } catch {
      setError('Fehler beim Speichern der Lifestyle-Daten');
    } finally {
      setSavingLifestyle(false);
    }
  }, [refetch]);

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

      {/* Diagnoses */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Diagnosen</h2>
          {savingDiagnoses && <span className="text-xs text-gray-400">Speichern…</span>}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Bekannte Diagnosen, die der KI-Doktor bei der Analyse berücksichtigen soll.
        </p>
        <TagInput
          tags={diagnoses}
          onChange={handleDiagnosesChange}
          placeholder="Diagnose eingeben und Enter drücken…"
          saving={savingDiagnoses}
        />
      </section>

      {/* Medications */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Pill className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Medikamente</h2>
          {savingMedications && <span className="text-xs text-gray-400">Speichern…</span>}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Aktuelle Medikamente inkl. Dosierung, die bei der Blutwert-Analyse berücksichtigt werden sollen.
        </p>
        <TagInput
          tags={medications}
          onChange={handleMedicationsChange}
          placeholder="Medikament eingeben und Enter drücken…"
          saving={savingMedications}
        />
      </section>

      {/* Lifestyle */}
      <section className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Lifestyle</h2>
          {savingLifestyle && <span className="text-xs text-gray-400">Speichern…</span>}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Lifestyle-Informationen helfen dem KI-Doktor, deine Blutwerte besser einzuordnen.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <LifestyleSelect
            label="Rauchen"
            value={lifestyle.smoking}
            options={SMOKING_OPTIONS}
            onChange={(v) => handleLifestyleChange({ ...lifestyle, smoking: v })}
            disabled={savingLifestyle}
          />
          <LifestyleSelect
            label="Alkohol"
            value={lifestyle.alcohol}
            options={ALCOHOL_OPTIONS}
            onChange={(v) => handleLifestyleChange({ ...lifestyle, alcohol: v })}
            disabled={savingLifestyle}
          />
          <LifestyleSelect
            label="Bewegung"
            value={lifestyle.exercise}
            options={EXERCISE_OPTIONS}
            onChange={(v) => handleLifestyleChange({ ...lifestyle, exercise: v })}
            disabled={savingLifestyle}
          />
          <LifestyleSelect
            label="Ernährung"
            value={lifestyle.diet}
            options={DIET_OPTIONS}
            onChange={(v) => handleLifestyleChange({ ...lifestyle, diet: v })}
            disabled={savingLifestyle}
          />
          <LifestyleSelect
            label="Stresslevel"
            value={lifestyle.stress_level}
            options={STRESS_OPTIONS}
            onChange={(v) => handleLifestyleChange({ ...lifestyle, stress_level: v })}
            disabled={savingLifestyle}
          />
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Schlaf (Std/Nacht)</label>
            <input
              type="number"
              min={4}
              max={12}
              step={0.5}
              value={lifestyle.sleep_hours ?? ''}
              onChange={(e) => {
                const val = e.target.value ? parseFloat(e.target.value) : undefined;
                handleLifestyleChange({ ...lifestyle, sleep_hours: val });
              }}
              placeholder="z.B. 7.5"
              disabled={savingLifestyle}
              className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            />
          </div>
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
