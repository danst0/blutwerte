import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { bloodValues as bvApi, reference as refApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { getValueStatus } from '@/lib/utils';
import type { ReferenceValue, BloodValue } from '@/types';
import { Plus, Trash2, Search, CheckCircle } from 'lucide-react';

interface ValueRow {
  id: string;
  name: string;
  long_name?: string;
  short_name?: string;
  value: string;
  unit: string;
  category: string;
  ref?: ReferenceValue;
}

export default function EnterValues() {
  const navigate = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [labName, setLabName] = useState('');
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState<ValueRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Autocomplete state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ReferenceValue[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [allRefs, setAllRefs] = useState<ReferenceValue[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    refApi.getAll().then((db) => setAllRefs(db.values));
  }, []);

  // Click outside to close
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults(allRefs.slice(0, 10));
      setSearchOpen(true);
      return;
    }
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      const lower = q.toLowerCase();
      const results = allRefs.filter(
        (r) =>
          r.name.toLowerCase().includes(lower) ||
          r.aliases.some((a) => a.toLowerCase().includes(lower))
      ).slice(0, 10);
      setSearchResults(results);
      setSearchOpen(true);
    }, 150);
  }, [allRefs]);

  const addValue = (ref: ReferenceValue) => {
    setRows((prev) => {
      // Don't add duplicates
      if (prev.some((r) => r.name === ref.name)) return prev;
      // short_name: use first alias if it exists and is shorter than the name
      const firstAlias = ref.aliases?.[0];
      const short_name = firstAlias && firstAlias.length < ref.name.length ? firstAlias : undefined;
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          name: ref.name,
          long_name: ref.name,
          short_name,
          value: '',
          unit: ref.unit,
          category: ref.category,
          ref,
        },
      ];
    });
    setSearchQuery('');
    setSearchOpen(false);
  };

  const addCustomValue = () => {
    setRows((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        name: '',
        value: '',
        unit: '',
        category: 'Sonstige',
        ref: undefined,
      },
    ]);
  };

  const updateRow = (id: string, field: keyof ValueRow, val: string) => {
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: val } : r))
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const validRows = rows.filter((r) => r.name.trim() && r.value.trim());
    if (validRows.length === 0) {
      setError('Bitte mindestens einen Blutwert eintragen.');
      return;
    }

    const invalidValues = validRows.filter((r) => isNaN(parseFloat(r.value)));
    if (invalidValues.length > 0) {
      setError(`Ungültiger Wert für: ${invalidValues.map((r) => r.name).join(', ')}`);
      return;
    }

    setSaving(true);
    try {
      await bvApi.create({
        date,
        lab_name: labName || undefined,
        notes: notes || undefined,
        values: validRows.map((r) => ({
          name: r.name.trim(),
          value: parseFloat(r.value),
          unit: r.unit.trim(),
          category: r.category.trim() || 'Sonstige',
          ...(r.short_name ? { short_name: r.short_name } : {}),
          ...(r.long_name ? { long_name: r.long_name } : {}),
        })),
      });
      setSuccess(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <CheckCircle className="w-16 h-16 text-green-500" />
        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">Werte gespeichert!</p>
        <p className="text-gray-500 dark:text-gray-400">Weiterleitung zum Dashboard...</p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Blutwerte eintragen</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Trage deine aktuellen Laborwerte ein</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Metadata */}
        <Card>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Eintrag-Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Datum"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
            <Input
              label="Labor / Arzt (optional)"
              placeholder="z.B. Hausarzt Dr. Müller"
              value={labName}
              onChange={(e) => setLabName(e.target.value)}
            />
          </div>
          <div className="mt-4">
            <Textarea
              label="Notizen (optional)"
              placeholder="z.B. Nüchternblut, Routinekontrolle, ..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
        </Card>

        {/* Add blood values */}
        <Card>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">Blutwerte</h2>

          {/* Search/Autocomplete */}
          <div className="relative mb-4" ref={searchRef}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Blutwert suchen (z.B. Hämoglobin, HbA1c, ...)"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  onFocus={() => handleSearch(searchQuery)}
                  className="input-base pl-9"
                />
              </div>
              <Button type="button" variant="secondary" onClick={addCustomValue} icon={<Plus className="w-4 h-4" />}>
                Benutzerdefiniert
              </Button>
            </div>

            {/* Dropdown */}
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                {searchResults.map((ref) => (
                  <button
                    key={ref.id}
                    type="button"
                    onClick={() => addValue(ref)}
                    disabled={rows.some((r) => r.name === ref.name)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed text-left border-b border-gray-100 dark:border-gray-800 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{ref.name}</p>
                      <p className="text-xs text-gray-400">{ref.category} · {ref.unit}</p>
                    </div>
                    {rows.some((r) => r.name === ref.name) && (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Value rows */}
          {rows.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              Suche nach einem Blutwert oder füge einen benutzerdefinierten hinzu
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => {
                const numVal = parseFloat(row.value);
                const status = !isNaN(numVal) && row.value !== '' && row.ref
                  ? getValueStatus(numVal, row.ref)
                  : null;

                return (
                  <div key={row.id} className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        {/* Name row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {row.ref ? (
                            <span className="font-medium text-gray-900 dark:text-gray-100 text-sm">{row.name}</span>
                          ) : (
                            <input
                              type="text"
                              placeholder="Bezeichnung"
                              value={row.name}
                              onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                              className="input-base text-sm py-1 flex-1"
                            />
                          )}
                          {row.ref && (
                            <span className="text-xs text-gray-400">{row.ref.category}</span>
                          )}
                          {status && <StatusBadge status={status} />}
                        </div>

                        {/* Value + unit */}
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            placeholder="Wert"
                            value={row.value}
                            onChange={(e) => updateRow(row.id, 'value', e.target.value)}
                            step="any"
                            className="input-base text-sm py-1 w-32"
                          />
                          {row.ref ? (
                            <span className="text-sm text-gray-500 dark:text-gray-400">{row.unit}</span>
                          ) : (
                            <input
                              type="text"
                              placeholder="Einheit"
                              value={row.unit}
                              onChange={(e) => updateRow(row.id, 'unit', e.target.value)}
                              className="input-base text-sm py-1 w-24"
                            />
                          )}
                          {row.ref && (
                            <span className="text-xs text-gray-400">
                              Ref: {row.ref.ref_min ?? '?'} – {row.ref.ref_max ?? '?'}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <Button type="submit" loading={saving} disabled={rows.length === 0}>
            Speichern
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate('/dashboard')}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </div>
  );
}
