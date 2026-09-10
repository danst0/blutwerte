import React, { useState } from 'react';
import { report as reportApi, downloadBlob } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { X, FileText, Sparkles, AlertCircle } from 'lucide-react';
import type { ReportScope } from '@/types';

interface ReportDialogProps {
  open: boolean;
  onClose: () => void;
}

const PERIOD_OPTIONS = [
  { label: 'Gesamter Verlauf', months: 0 },
  { label: 'Letzte 24 Monate', months: 24 },
  { label: 'Letzte 12 Monate', months: 12 },
  { label: 'Letzte 6 Monate', months: 6 },
];

const SCOPE_OPTIONS: Array<{ label: string; hint: string; scope: ReportScope }> = [
  { label: 'Alle Werte', hint: 'Vollständige Tabelle inkl. Normalbefunden', scope: 'all' },
  { label: 'Nur auffällige', hint: 'Kompakter Bericht mit den Abweichungen', scope: 'abnormal' },
];

export function ReportDialog({ open, onClose }: ReportDialogProps) {
  const [months, setMonths] = useState(0);
  const [scope, setScope] = useState<ReportScope>('all');
  const [includeAi, setIncludeAi] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleGenerate = async () => {
    setError('');
    setLoading(true);
    try {
      const { blob, filename } = await reportApi.pdf({ months, scope, includeAi });
      downloadBlob(blob, filename);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Der Bericht konnte nicht erstellt werden.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={loading ? undefined : onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-md mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">PDF-Analyse erstellen</h2>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          Aktueller Stand, Verlaufsdiagramme und die Einschätzung des KI-Doktors in einem Dokument.
        </p>

        <div className="space-y-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Zeitraum</label>
            <div className="grid grid-cols-2 gap-2">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.months}
                  type="button"
                  onClick={() => setMonths(opt.months)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    months === opt.months
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Umfang</label>
            <div className="grid grid-cols-1 gap-2">
              {SCOPE_OPTIONS.map((opt) => (
                <button
                  key={opt.scope}
                  type="button"
                  onClick={() => setScope(opt.scope)}
                  className={`px-3 py-2 rounded-lg text-left transition-colors border ${
                    scope === opt.scope
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  <span
                    className={`block text-sm font-medium ${
                      scope === opt.scope
                        ? 'text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{opt.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <input
              type="checkbox"
              checked={includeAi}
              onChange={(e) => setIncludeAi(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="flex-1">
              <span className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                Einschätzung des KI-Doktors
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Zählt auf dein Tageslimit von 50 KI-Anfragen.
              </span>
            </span>
          </label>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
            </div>
          )}

          {loading && includeAi && (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              Der KI-Doktor wertet gerade deine Werte aus – das dauert einen Moment.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading} className="flex-1">
              Abbrechen
            </Button>
            <Button
              type="button"
              onClick={handleGenerate}
              loading={loading}
              icon={<FileText className="w-4 h-4" />}
              className="flex-1"
            >
              {loading ? 'Wird erstellt…' : 'PDF erstellen'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
