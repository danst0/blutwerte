import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bloodValues as bvApi, reference as refApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { TrafficDot } from '@/components/TrafficLight';
import { getValueStatus, formatDate, formatNumber } from '@/lib/utils';
import type { UserData, BloodEntry, ReferenceValue } from '@/types';
import {
  PlusCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Calendar,
  FlaskConical,
  FileText,
} from 'lucide-react';

export default function AllValues() {
  const [userData, setUserData] = useState<UserData | null>(null);
  const [refDb, setRefDb] = useState<Record<string, ReferenceValue>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const load = async () => {
    const [data, refs] = await Promise.all([bvApi.getAll(), refApi.getAll()]);
    setUserData(data);
    const map: Record<string, ReferenceValue> = {};
    const cats = new Set<string>();
    refs.values.forEach((r) => {
      map[r.name] = r;
      cats.add(r.category);
    });
    data.entries.forEach((e) => e.values.forEach((v) => cats.add(v.category)));
    setRefDb(map);
    setCategories([...cats].sort());
  };

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteEntry = async (id: string) => {
    if (!confirm('Diesen Eintrag wirklich löschen?')) return;
    setDeleting(id);
    try {
      await bvApi.delete(id);
      setUserData((prev) =>
        prev ? { ...prev, entries: prev.entries.filter((e) => e.id !== id) } : prev
      );
    } finally {
      setDeleting(null);
    }
  };

  const exportCSV = () => {
    if (!userData) return;
    const rows = [['Datum', 'Labor', 'Wert', 'Einheit', 'Kategorie', 'Status']];
    for (const entry of userData.entries) {
      for (const val of entry.values) {
        const status = getValueStatus(val.value, refDb[val.name]);
        rows.push([entry.date, entry.lab_name || '', val.name, String(val.value), val.unit, val.category, status]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `blutwerte_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const entries = userData?.entries ?? [];
  const filteredEntries = filterCategory
    ? entries.filter((e) => e.values.some((v) => v.category === filterCategory))
    : entries;

  return (
    <div className="space-y-6 animate-slide-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Alle Blutwert-Einträge</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {entries.length} {entries.length === 1 ? 'Eintrag' : 'Einträge'} gesamt
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="secondary" onClick={exportCSV} icon={<FileText className="w-4 h-4" />} size="sm">
            CSV Export
          </Button>
          <Link to="/enter">
            <Button icon={<PlusCircle className="w-4 h-4" />} size="sm">Neuer Eintrag</Button>
          </Link>
        </div>
      </div>

      {/* Filter */}
      {categories.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterCategory('')}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              !filterCategory
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Alle
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat === filterCategory ? '' : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filterCategory === cat
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filteredEntries.length === 0 ? (
        <Card className="text-center py-16">
          <FlaskConical className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Noch keine Einträge vorhanden</p>
          <Link to="/enter" className="mt-4 inline-block">
            <Button icon={<PlusCircle className="w-4 h-4" />}>Ersten Eintrag erstellen</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-3">
          {filteredEntries.map((entry) => {
            const isOpen = expanded.has(entry.id);
            const filteredValues = filterCategory
              ? entry.values.filter((v) => v.category === filterCategory)
              : entry.values;
            const abnormal = filteredValues.filter((v) => {
              const s = getValueStatus(v.value, refDb[v.name]);
              return s !== 'normal' && s !== 'unknown';
            });

            return (
              <Card key={entry.id} padding={false} className="overflow-hidden">
                {/* Entry header */}
                <button
                  onClick={() => toggle(entry.id)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        {formatDate(entry.date)}
                      </p>
                      {entry.lab_name && (
                        <span className="text-sm text-gray-500 dark:text-gray-400">{entry.lab_name}</span>
                      )}
                      {abnormal.length > 0 && (
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          {abnormal.length} auffällig
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {filteredValues.length} Werte
                      </span>
                      <div className="flex gap-1">
                        {filteredValues.slice(0, 6).map((v) => (
                          <TrafficDot
                            key={v.name}
                            status={getValueStatus(v.value, refDb[v.name])}
                            size="sm"
                          />
                        ))}
                        {filteredValues.length > 6 && (
                          <span className="text-xs text-gray-400">+{filteredValues.length - 6}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                      disabled={deleting === entry.id}
                      className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded values */}
                {isOpen && (
                  <div className="border-t border-gray-200 dark:border-gray-800 p-4">
                    {entry.notes && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 italic">
                        {entry.notes}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {filteredValues.map((v) => {
                        const status = getValueStatus(v.value, refDb[v.name]);
                        return (
                          <Link
                            key={v.name}
                            to={`/values/${encodeURIComponent(v.name)}`}
                            className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800 hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.name}</p>
                              <p className="font-semibold text-gray-900 dark:text-gray-100">
                                {formatNumber(v.value)} <span className="text-xs font-normal text-gray-400">{v.unit}</span>
                              </p>
                            </div>
                            <StatusBadge status={status} />
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
