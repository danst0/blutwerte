import React, { useState } from 'react';
import { shares as sharesApi } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { X } from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const EXPIRY_OPTIONS = [
  { label: '7 Tage', days: 7 },
  { label: '30 Tage', days: 30 },
  { label: '90 Tage', days: 90 },
  { label: 'Unbegrenzt', days: 0 },
];

export function ShareDialog({ open, onClose, onCreated }: ShareDialogProps) {
  const [email, setEmail] = useState('');
  const [expiryDays, setExpiryDays] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Bitte E-Mail-Adresse eingeben');
      return;
    }

    setLoading(true);
    try {
      const expires_at = expiryDays > 0
        ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000).toISOString()
        : undefined;

      await sharesApi.create(email.trim(), expires_at);
      setEmail('');
      setExpiryDays(0);
      onCreated();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Fehler beim Teilen';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Blutwerte teilen</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="E-Mail-Adresse"
            type="email"
            placeholder="nutzer@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error || undefined}
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Gültigkeit</label>
            <div className="grid grid-cols-2 gap-2">
              {EXPIRY_OPTIONS.map((opt) => (
                <button
                  key={opt.days}
                  type="button"
                  onClick={() => setExpiryDays(opt.days)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    expiryDays === opt.days
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Der Empfänger erhält Lesezugriff auf alle deine Blutwert-Einträge.
          </p>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
              Abbrechen
            </Button>
            <Button type="submit" loading={loading} className="flex-1">
              Teilen
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
