import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ai, bloodValues as bvApi, reference as refApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Textarea } from '@/components/ui/Input';
import { StatusBadge } from '@/components/ui/Badge';
import { getValueStatus } from '@/lib/utils';
import type { ExtractedBloodValue, ReferenceValue } from '@/types';
import { Upload, Camera, Trash2, CheckCircle, AlertCircle, ScanLine, X } from 'lucide-react';

type Phase = 'upload' | 'analyzing' | 'review' | 'saving' | 'success';

export default function ScanImport() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>('upload');
  const [error, setError] = useState('');

  // Upload
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Review
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [labName, setLabName] = useState('');
  const [notes, setNotes] = useState('');
  const [values, setValues] = useState<ExtractedBloodValue[]>([]);
  const [allRefs, setAllRefs] = useState<ReferenceValue[]>([]);

  useEffect(() => {
    refApi.getAll().then((db) => setAllRefs(db.values));
  }, []);

  const findRef = useCallback(
    (name: string): ReferenceValue | undefined => {
      const lower = name.toLowerCase();
      return allRefs.find(
        (r) =>
          r.name.toLowerCase() === lower ||
          r.aliases.some((a) => a.toLowerCase() === lower)
      );
    },
    [allRefs]
  );

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setError('');

    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(f);
    } else {
      setPreview(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const resetUpload = () => {
    setFile(null);
    setPreview(null);
    setError('');
    setPhase('upload');
  };

  const startAnalysis = async () => {
    if (!file) return;

    setPhase('analyzing');
    setError('');

    try {
      const result = await ai.scan(file);

      if (result.date) setDate(result.date);
      if (result.lab_name) setLabName(result.lab_name);
      setValues(result.values);
      setPhase('review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse fehlgeschlagen');
      setPhase('upload');
    }
  };

  const updateValue = (index: number, field: keyof ExtractedBloodValue, val: string | number) => {
    setValues((prev) =>
      prev.map((v, i) => (i === index ? { ...v, [field]: val } : v))
    );
  };

  const removeValue = (index: number) => {
    setValues((prev) => prev.filter((_, i) => i !== index));
  };

  const handleImport = async () => {
    setError('');
    const validValues = values.filter((v) => v.name.trim() && !isNaN(v.value));

    if (validValues.length === 0) {
      setError('Keine gültigen Werte zum Importieren.');
      return;
    }

    setPhase('saving');
    try {
      await bvApi.create({
        date,
        lab_name: labName || undefined,
        notes: notes || undefined,
        values: validValues.map((v) => ({
          name: v.name.trim(),
          value: v.value,
          unit: v.unit.trim(),
          category: v.category || 'Sonstige',
          ...(v.short_name ? { short_name: v.short_name } : {}),
          ...(v.long_name ? { long_name: v.long_name } : {}),
        })),
      });
      setPhase('success');
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern');
      setPhase('review');
    }
  };

  // ─── Success ──────────────────────────────────────────────────────────────────

  if (phase === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <CheckCircle className="w-16 h-16 text-green-500" />
        <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">
          {values.length} Werte importiert!
        </p>
        <p className="text-gray-500 dark:text-gray-400">Weiterleitung zum Dashboard...</p>
      </div>
    );
  }

  // ─── Analyzing ────────────────────────────────────────────────────────────────

  if (phase === 'analyzing') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scan Import</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Laborbericht wird analysiert...</p>
        </div>
        <Card>
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <div className="relative">
              <ScanLine className="w-12 h-12 text-blue-500 animate-pulse" />
            </div>
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Gemini analysiert deinen Laborbericht...
            </p>
            <p className="text-gray-400 dark:text-gray-500 text-xs">
              Dies kann einige Sekunden dauern
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // ─── Review ───────────────────────────────────────────────────────────────────

  if (phase === 'review' || phase === 'saving') {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scan Import</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {values.length} Werte erkannt – bitte überprüfen und korrigieren
          </p>
        </div>

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

        {/* Values */}
        <Card>
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Erkannte Blutwerte
          </h2>

          {values.length === 0 ? (
            <div className="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
              Keine Werte erkannt
            </div>
          ) : (
            <div className="space-y-3">
              {values.map((val, index) => {
                const ref = findRef(val.name);
                const status = ref ? getValueStatus(val.value, ref, user?.gender) : null;
                const isMatched = !!val.ref_id;

                return (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 space-y-2">
                        {/* Name row */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <input
                            type="text"
                            value={val.name}
                            onChange={(e) => updateValue(index, 'name', e.target.value)}
                            className="input-base text-sm py-1 flex-1 font-medium"
                          />
                          {isMatched && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" /> erkannt
                            </span>
                          )}
                          {!isMatched && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" /> unbekannt
                            </span>
                          )}
                          {val.category && (
                            <span className="text-xs text-gray-400">{val.category}</span>
                          )}
                          {status && <StatusBadge status={status} />}
                        </div>

                        {/* Value + unit */}
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={val.value}
                            onChange={(e) =>
                              updateValue(index, 'value', parseFloat(e.target.value) || 0)
                            }
                            step="any"
                            className="input-base text-sm py-1 w-32"
                          />
                          <input
                            type="text"
                            value={val.unit}
                            onChange={(e) => updateValue(index, 'unit', e.target.value)}
                            className="input-base text-sm py-1 w-24"
                          />
                          {ref && (
                            <span className="text-xs text-gray-400">
                              Ref: {ref.ref_min ?? '?'} – {ref.ref_max ?? '?'} {ref.unit}
                            </span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeValue(index)}
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
          <Button
            onClick={handleImport}
            loading={phase === 'saving'}
            disabled={values.length === 0}
          >
            {values.length} Werte importieren
          </Button>
          <Button variant="secondary" onClick={resetUpload}>
            Neuer Scan
          </Button>
          <Button variant="ghost" onClick={() => navigate('/dashboard')}>
            Abbrechen
          </Button>
        </div>
      </div>
    );
  }

  // ─── Upload Phase ─────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Scan Import</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Lade einen Laborbericht hoch und lasse die Werte automatisch erkennen
        </p>
      </div>

      <Card>
        {!file ? (
          <>
            {/* Drop zone */}
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                ${
                  dragOver
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : 'border-gray-300 dark:border-gray-700 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                }
              `}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-500 mb-3" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Laborbericht hierher ziehen
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                oder klicken zum Auswählen
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                JPG, PNG, WebP oder PDF · Max. 10 MB
              </p>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />

            {/* Camera button */}
            <div className="mt-4 flex justify-center">
              <Button
                variant="secondary"
                icon={<Camera className="w-4 h-4" />}
                onClick={() => cameraInputRef.current?.click()}
              >
                Foto aufnehmen
              </Button>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          </>
        ) : (
          <>
            {/* File preview */}
            <div className="flex items-start gap-4">
              {preview && (
                <img
                  src={preview}
                  alt="Vorschau"
                  className="w-24 h-24 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
                />
              )}
              {!preview && (
                <div className="w-24 h-24 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <ScanLine className="w-8 h-8 text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {file.name}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {(file.size / 1024 / 1024).toFixed(1)} MB · {file.type}
                </p>
              </div>
              <button
                onClick={resetUpload}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 flex gap-3">
              <Button onClick={startAnalysis} icon={<ScanLine className="w-4 h-4" />}>
                Analysieren
              </Button>
              <Button variant="secondary" onClick={resetUpload}>
                Andere Datei
              </Button>
            </div>
          </>
        )}
      </Card>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
