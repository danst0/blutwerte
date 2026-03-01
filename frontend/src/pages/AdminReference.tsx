import React, { useEffect, useState } from 'react';
import { adminReference as adminApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import type { ReferenceValue, ReferenceDatabase } from '@/types';
import { PlusCircle, Pencil, Trash2, Database, Search, X } from 'lucide-react';

const EMPTY_VALUE: Omit<ReferenceValue, 'id'> = {
  name: '',
  short_name: '',
  long_name: '',
  aliases: [],
  category: '',
  unit: '',
  description: '',
  high_info: '',
  low_info: '',
  recommendations: '',
};

type FormValue = Omit<ReferenceValue, 'id'> & { id?: string; aliasesRaw: string };

function toFormValue(v: ReferenceValue): FormValue {
  return { ...v, aliasesRaw: v.aliases.join(', ') };
}

function fromFormValue(f: FormValue): ReferenceValue {
  const aliases = f.aliasesRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const { aliasesRaw, ...rest } = f;
  return { ...rest, id: rest.id ?? '', aliases };
}

function numField(v: string): number | undefined {
  const n = parseFloat(v);
  return isNaN(n) ? undefined : n;
}

export default function AdminReference() {
  const [db, setDb] = useState<ReferenceDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<FormValue | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const data = await adminApi.getAll();
    setDb(data);
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const startNew = () => {
    setForm({ ...EMPTY_VALUE, aliasesRaw: '' });
    setEditingId('new');
    setError(null);
  };

  const startEdit = (v: ReferenceValue) => {
    setForm(toFormValue(v));
    setEditingId(v.id);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(null);
    setError(null);
  };

  const setField = <K extends keyof FormValue>(key: K, value: FormValue[K]) => {
    setForm((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  const setNumField = (key: keyof ReferenceValue, raw: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const val = numField(raw);
      return { ...prev, [key]: val };
    });
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const value = fromFormValue(form);
      if (editingId === 'new') {
        const { id: _id, ...body } = value;
        await adminApi.create(body);
      } else {
        await adminApi.update(value.id, value);
      }
      await load();
      cancelEdit();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const deleteValue = async (id: string) => {
    if (!confirm(`Referenzwert "${id}" wirklich löschen?`)) return;
    setDeleting(id);
    try {
      await adminApi.delete(id);
      await load();
    } finally {
      setDeleting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const values = db?.values ?? [];
  const filtered = search
    ? values.filter(
        (v) =>
          v.name.toLowerCase().includes(search.toLowerCase()) ||
          v.category.toLowerCase().includes(search.toLowerCase()) ||
          v.unit.toLowerCase().includes(search.toLowerCase())
      )
    : values;

  const numInput = (label: string, key: keyof ReferenceValue) => (
    <Input
      label={label}
      type="number"
      step="any"
      value={form?.[key] !== undefined ? String(form[key]) : ''}
      onChange={(e) => setNumField(key, e.target.value)}
    />
  );

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Stammdaten</h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm">{values.length} Referenzwerte</p>
          </div>
        </div>
        {editingId === null && (
          <Button icon={<PlusCircle className="w-4 h-4" />} onClick={startNew}>
            Neuer Wert
          </Button>
        )}
      </div>

      {/* Form */}
      {editingId !== null && form && (
        <Card>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-5">
            {editingId === 'new' ? 'Neuer Referenzwert' : `Bearbeiten: ${editingId}`}
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Grunddaten */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Grunddaten
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Name *"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                placeholder="z.B. Hämoglobin"
              />
              <Input
                label="Kategorie *"
                value={form.category}
                onChange={(e) => setField('category', e.target.value)}
                placeholder="z.B. Blutbild"
              />
              <Input
                label="Einheit *"
                value={form.unit}
                onChange={(e) => setField('unit', e.target.value)}
                placeholder="z.B. g/dl"
              />
              <Input
                label="Kurzname"
                value={form.short_name ?? ''}
                onChange={(e) => setField('short_name', e.target.value)}
                placeholder="z.B. Hb"
              />
              <Input
                label="Langer Name"
                value={form.long_name ?? ''}
                onChange={(e) => setField('long_name', e.target.value)}
                placeholder="z.B. Hämoglobin (Blutfarbstoff)"
              />
              <Input
                label="Aliase (kommagetrennt)"
                value={form.aliasesRaw}
                onChange={(e) => setField('aliasesRaw', e.target.value)}
                placeholder="z.B. HB, Haemoglobin"
              />
            </div>
          </div>

          {/* Grenzwerte */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Grenzwerte
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {numInput('Ref. Min', 'ref_min')}
              {numInput('Ref. Max', 'ref_max')}
              {numInput('Ref. Min (w)', 'ref_min_female')}
              {numInput('Ref. Max (w)', 'ref_max_female')}
              {numInput('Ref. Min (m)', 'ref_min_male')}
              {numInput('Ref. Max (m)', 'ref_max_male')}
              {numInput('Optimal Min', 'optimal_min')}
              {numInput('Optimal Max', 'optimal_max')}
              {numInput('Kritisch Tief', 'critical_low')}
              {numInput('Kritisch Hoch', 'critical_high')}
            </div>
          </div>

          {/* Texte */}
          <div className="space-y-4 mb-6">
            <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              Texte
            </h3>
            <Textarea
              label="Beschreibung"
              rows={3}
              value={form.description}
              onChange={(e) => setField('description', e.target.value)}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Textarea
                label="Info bei erhöhtem Wert"
                rows={3}
                value={form.high_info}
                onChange={(e) => setField('high_info', e.target.value)}
              />
              <Textarea
                label="Info bei niedrigem Wert"
                rows={3}
                value={form.low_info}
                onChange={(e) => setField('low_info', e.target.value)}
              />
            </div>
            <Textarea
              label="Empfehlungen"
              rows={3}
              value={form.recommendations}
              onChange={(e) => setField('recommendations', e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={save} loading={saving}>
              Speichern
            </Button>
            <Button variant="secondary" onClick={cancelEdit} disabled={saving} icon={<X className="w-4 h-4" />}>
              Abbrechen
            </Button>
          </div>
        </Card>
      )}

      {/* Search */}
      {editingId === null && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Suchen nach Name, Kategorie, Einheit..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
        </div>
      )}

      {/* Table */}
      {editingId === null && (
        <Card padding={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Kategorie</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Einheit</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Referenz</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-600">
                      Keine Referenzwerte gefunden
                    </td>
                  </tr>
                )}
                {filtered.map((v) => {
                  const refRange =
                    v.ref_min !== undefined && v.ref_max !== undefined
                      ? `${v.ref_min} – ${v.ref_max}`
                      : v.ref_min !== undefined
                      ? `≥ ${v.ref_min}`
                      : v.ref_max !== undefined
                      ? `≤ ${v.ref_max}`
                      : '–';
                  return (
                    <tr key={v.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-gray-100">{v.name}</p>
                        {v.short_name && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">{v.short_name}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.category}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{v.unit}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{refRange}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => startEdit(v)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-400 hover:text-blue-500 transition-colors"
                            title="Bearbeiten"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteValue(v.id)}
                            disabled={deleting === v.id}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-50"
                            title="Löschen"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
