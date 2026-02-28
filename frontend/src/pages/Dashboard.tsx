import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { bloodValues as bvApi, reference as refApi } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { TrafficDot } from '@/components/TrafficLight';
import { getValueStatus, formatDate, formatNumber, groupByCategory } from '@/lib/utils';
import type { UserData, BloodEntry, BloodValue, ReferenceValue } from '@/types';
import {
  PlusCircle,
  MessageSquareHeart,
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  FlaskConical,
  AlertCircle,
} from 'lucide-react';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

function Sparkline({ data }: { data: { value: number }[] }) {
  if (data.length < 2) return null;
  return (
    <div className="h-10 w-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line
            type="monotone"
            dataKey="value"
            stroke="#3b82f6"
            strokeWidth={1.5}
            dot={false}
          />
          <Tooltip
            contentStyle={{ display: 'none' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function getTrend(history: { value: number }[]) {
  if (history.length < 2) return null;
  const diff = history[history.length - 1].value - history[history.length - 2].value;
  const pct = Math.abs(diff / history[history.length - 2].value) * 100;
  if (pct < 3) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

interface ValueSummary {
  name: string;
  category: string;
  latestValue: number;
  unit: string;
  ref?: ReferenceValue;
  history: { date: string; value: number }[];
}

export default function Dashboard() {
  const { user } = useAuth();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [refDb, setRefDb] = useState<Record<string, ReferenceValue>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([bvApi.getAll(), refApi.getAll()]).then(([data, refs]) => {
      setUserData(data);
      const map: Record<string, ReferenceValue> = {};
      refs.values.forEach((r) => { map[r.name] = r; });
      setRefDb(map);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const lastEntry: BloodEntry | null = userData?.entries?.[0] ?? null;

  // Build value summary with history
  const valueSummary: ValueSummary[] = (() => {
    if (!userData) return [];
    const sorted = [...userData.entries].sort((a, b) => a.date.localeCompare(b.date));
    const byName: Record<string, { date: string; value: number }[]> = {};
    const meta: Record<string, { category: string; unit: string }> = {};
    for (const entry of sorted) {
      for (const val of entry.values) {
        if (!byName[val.name]) byName[val.name] = [];
        byName[val.name].push({ date: entry.date, value: val.value });
        meta[val.name] = { category: val.category, unit: val.unit };
      }
    }
    return Object.entries(byName)
      .map(([name, history]) => ({
        name,
        category: meta[name].category,
        latestValue: history[history.length - 1].value,
        unit: meta[name].unit,
        ref: refDb[name],
        history,
      }))
      .sort((a, b) => {
        // Sort by status severity first
        const statusOrder = { critical_high: 0, critical_low: 0, high: 1, low: 1, warning: 2, unknown: 3, normal: 4 };
        const sa = getValueStatus(a.latestValue, a.ref);
        const sb = getValueStatus(b.latestValue, b.ref);
        return (statusOrder[sa] ?? 4) - (statusOrder[sb] ?? 4);
      });
  })();

  const statusCounts = valueSummary.reduce(
    (acc, v) => {
      const s = getValueStatus(v.latestValue, v.ref);
      if (s === 'normal') acc.normal++;
      else if (s === 'warning') acc.warning++;
      else if (s === 'unknown') acc.unknown++;
      else acc.abnormal++;
      return acc;
    },
    { normal: 0, warning: 0, abnormal: 0, unknown: 0 }
  );

  const categoryGroups = groupByCategory(valueSummary);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Guten Tag, {user?.displayName?.split(' ')[0] ?? 'Nutzer'} 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {lastEntry
              ? `Letzter Eintrag: ${formatDate(lastEntry.date)}`
              : 'Noch keine Blutwerte eingetragen'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/enter">
            <Button icon={<PlusCircle className="w-4 h-4" />}>Werte eintragen</Button>
          </Link>
          <Link to="/ai">
            <Button variant="secondary" icon={<MessageSquareHeart className="w-4 h-4" />}>
              KI-Doktor
            </Button>
          </Link>
        </div>
      </div>

      {userData?.entries.length === 0 ? (
        <Card className="text-center py-16">
          <FlaskConical className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
            Noch keine Blutwerte
          </h2>
          <p className="text-gray-400 dark:text-gray-500 mb-6">
            Trage deine ersten Blutwerte ein, um hier deine Übersicht zu sehen.
          </p>
          <Link to="/enter">
            <Button icon={<PlusCircle className="w-4 h-4" />}>Ersten Eintrag erstellen</Button>
          </Link>
        </Card>
      ) : (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Im Normalbereich', count: statusCounts.normal, color: 'text-green-600 dark:text-green-400', bg: 'bg-green-50 dark:bg-green-900/20' },
              { label: 'Grenzwertig', count: statusCounts.warning, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/20' },
              { label: 'Auffällig', count: statusCounts.abnormal, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20' },
              { label: 'Gesamt Werte', count: valueSummary.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-900/20' },
            ].map(({ label, count, color, bg }) => (
              <Card key={label} className={`${bg} border-0`}>
                <p className={`text-3xl font-bold ${color}`}>{count}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{label}</p>
              </Card>
            ))}
          </div>

          {/* Alerts */}
          {valueSummary.some(v => {
            const s = getValueStatus(v.latestValue, v.ref);
            return s === 'critical_high' || s === 'critical_low';
          }) && (
            <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-800 dark:text-red-300">Kritische Werte vorhanden</p>
                <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                  Einige Blutwerte liegen im kritischen Bereich. Bitte konsultieren Sie zeitnah einen Arzt.
                </p>
              </div>
            </div>
          )}

          {/* Values by category */}
          {Object.entries(categoryGroups).map(([category, values]) => (
            <div key={category}>
              <h2 className="text-base font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                {category}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {values.map((v) => {
                  const status = getValueStatus(v.latestValue, v.ref);
                  const trend = getTrend(v.history);
                  return (
                    <Link key={v.name} to={`/values/${encodeURIComponent(v.name)}`}>
                      <Card className="hover:shadow-md transition-shadow cursor-pointer group">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 dark:text-gray-100 text-sm group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                              {v.name}
                            </p>
                            <StatusBadge status={status} className="mt-1" />
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <TrafficDot status={status} />
                          </div>
                        </div>

                        <div className="flex items-end justify-between">
                          <div>
                            <span className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                              {formatNumber(v.latestValue)}
                            </span>
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">{v.unit}</span>
                            {trend && (
                              <span className="ml-2 inline-flex items-center">
                                {trend === 'up' && <TrendingUp className="w-4 h-4 text-blue-500" />}
                                {trend === 'down' && <TrendingDown className="w-4 h-4 text-blue-500" />}
                                {trend === 'stable' && <Minus className="w-4 h-4 text-gray-400" />}
                              </span>
                            )}
                          </div>
                          {v.history.length >= 2 && <Sparkline data={v.history} />}
                        </div>

                        {v.ref && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                            Ref: {v.ref.ref_min ?? '?'} – {v.ref.ref_max ?? '?'} {v.unit}
                          </p>
                        )}
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Last entries */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                Letzte Einträge
              </h2>
              <Link to="/values" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                Alle anzeigen →
              </Link>
            </div>
            <div className="space-y-3">
              {userData?.entries.slice(0, 5).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                      {formatDate(entry.date)}
                      {entry.lab_name && (
                        <span className="text-gray-400 dark:text-gray-500 font-normal"> · {entry.lab_name}</span>
                      )}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {entry.values.length} Werte
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {entry.values.slice(0, 4).map((v) => (
                      <TrafficDot
                        key={v.name}
                        status={getValueStatus(v.value, refDb[v.name])}
                        size="sm"
                      />
                    ))}
                    {entry.values.length > 4 && (
                      <span className="text-xs text-gray-400">+{entry.values.length - 4}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
