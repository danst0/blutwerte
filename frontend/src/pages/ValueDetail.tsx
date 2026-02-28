import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { bloodValues as bvApi, reference as refApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { getValueStatus, formatDate, formatNumber, getTrend } from '@/lib/utils';
import type { ReferenceValue, ValueHistoryPoint } from '@/types';
import { ArrowLeft, TrendingUp, TrendingDown, Minus, Info, BookOpen, Lightbulb } from 'lucide-react';
import {
  ComposedChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
  Dot,
} from 'recharts';
import { format, parseISO } from 'date-fns';

const TIME_RANGES = [
  { label: '6 Monate', months: 6 },
  { label: '1 Jahr', months: 12 },
  { label: '3 Jahre', months: 36 },
  { label: 'Alle', months: 9999 },
];

interface ChartDataPoint {
  date: string;
  dateLabel: string;
  value: number;
  status: string;
}

const CustomDot = (props: { cx?: number; cy?: number; payload?: ChartDataPoint }) => {
  const { cx = 0, cy = 0, payload } = props;
  const colors: Record<string, string> = {
    normal: '#22c55e',
    warning: '#f59e0b',
    high: '#ef4444',
    low: '#ef4444',
    critical_high: '#7f1d1d',
    critical_low: '#7f1d1d',
    unknown: '#9ca3af',
  };
  const color = colors[payload?.status ?? 'unknown'] ?? '#9ca3af';
  return <Dot cx={cx} cy={cy} r={5} fill={color} stroke="white" strokeWidth={2} />;
};

export default function ValueDetail() {
  const { name } = useParams<{ name: string }>();
  const valueName = decodeURIComponent(name ?? '');
  const [history, setHistory] = useState<ValueHistoryPoint[]>([]);
  const [ref, setRef] = useState<ReferenceValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState(12);
  const [activeTab, setActiveTab] = useState<'chart' | 'info'>('chart');

  useEffect(() => {
    Promise.all([
      bvApi.getHistory(valueName),
      refApi.getByName(valueName).catch(() => null),
    ]).then(([hist, refData]) => {
      setHistory(hist.history);
      setRef(refData);
    }).finally(() => setLoading(false));
  }, [valueName]);

  const now = new Date();
  const filteredHistory = history.filter((h) => {
    if (timeRange === 9999) return true;
    const d = parseISO(h.date);
    const monthsDiff = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
    return monthsDiff <= timeRange;
  });

  const chartData: ChartDataPoint[] = filteredHistory.map((h) => ({
    date: h.date,
    dateLabel: format(parseISO(h.date), 'dd.MM.yyyy'),
    value: h.value,
    status: getValueStatus(h.value, ref ?? undefined),
  }));

  const latest = history[history.length - 1];
  const latestStatus = latest ? getValueStatus(latest.value, ref ?? undefined) : 'unknown';
  const trend = getTrend(history);

  const unit = latest?.unit ?? ref?.unit ?? '';

  const yDomain = (() => {
    if (chartData.length === 0) return ['auto', 'auto'] as [string, string];
    const vals = chartData.map((d) => d.value);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const refMin = ref?.ref_min ?? min;
    const refMax = ref?.ref_max ?? max;
    const critLow = ref?.critical_low ?? refMin;
    const critHigh = ref?.critical_high ?? refMax;
    const dataMin = Math.min(min, refMin, critLow);
    const dataMax = Math.max(max, refMax, critHigh);
    const pad = (dataMax - dataMin) * 0.15 || 1;
    return [dataMin - pad, dataMax + pad] as [number, number];
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Back */}
      <Link to="/dashboard" className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors">
        <ArrowLeft className="w-4 h-4" />
        Zurück
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{valueName}</h1>
          {(ref?.aliases?.length ?? 0) > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Auch bekannt als: {ref?.aliases.join(', ')}
            </p>
          )}
        </div>
        {latest && (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                  {formatNumber(latest.value)}
                </span>
                <span className="text-gray-500 dark:text-gray-400">{unit}</span>
                {trend === 'up' && <TrendingUp className="w-5 h-5 text-blue-500" />}
                {trend === 'down' && <TrendingDown className="w-5 h-5 text-blue-500" />}
                {trend === 'stable' && <Minus className="w-5 h-5 text-gray-400" />}
              </div>
              <div className="flex items-center justify-end gap-2 mt-1">
                <StatusBadge status={latestStatus} />
                <span className="text-xs text-gray-400">
                  vom {formatDate(latest.date)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800">
        {(['chart', 'info'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100'
            }`}
          >
            {tab === 'chart' ? 'Verlauf' : 'Info & Empfehlungen'}
          </button>
        ))}
      </div>

      {activeTab === 'chart' && (
        <>
          {/* Time range */}
          <div className="flex gap-2">
            {TIME_RANGES.map((r) => (
              <button
                key={r.label}
                onClick={() => setTimeRange(r.months)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  timeRange === r.months
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Chart */}
          <Card>
            {chartData.length < 1 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                Keine Daten im gewählten Zeitraum
              </div>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis
                      dataKey="dateLabel"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                    />
                    <YAxis
                      domain={yDomain}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => `${formatNumber(v)} ${unit}`}
                      width={80}
                    />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as ChartDataPoint;
                        return (
                          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg p-3 text-sm">
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{d.dateLabel}</p>
                            <p className="text-blue-600 dark:text-blue-400 font-bold">
                              {formatNumber(d.value)} {unit}
                            </p>
                            <StatusBadge status={d.status as Parameters<typeof StatusBadge>[0]['status']} />
                          </div>
                        );
                      }}
                    />

                    {/* Optimal range */}
                    {ref?.optimal_min !== undefined && ref?.optimal_max !== undefined && (
                      <ReferenceArea
                        y1={ref.optimal_min}
                        y2={ref.optimal_max}
                        fill="#22c55e"
                        fillOpacity={0.08}
                      />
                    )}

                    {/* Reference range */}
                    {ref?.ref_min !== undefined && ref?.ref_max !== undefined && (
                      <ReferenceArea
                        y1={ref.ref_min}
                        y2={ref.ref_max}
                        fill="#22c55e"
                        fillOpacity={0.15}
                        label={{ value: 'Referenzbereich', position: 'insideTopRight', fontSize: 10, fill: '#22c55e' }}
                      />
                    )}

                    {/* Critical lines */}
                    {ref?.critical_low !== undefined && (
                      <ReferenceLine y={ref.critical_low} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Kritisch', position: 'insideLeft', fontSize: 10, fill: '#ef4444' }} />
                    )}
                    {ref?.critical_high !== undefined && (
                      <ReferenceLine y={ref.critical_high} stroke="#ef4444" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: 'Kritisch', position: 'insideLeft', fontSize: 10, fill: '#ef4444' }} />
                    )}

                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={<CustomDot />}
                      activeDot={{ r: 7 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Reference info */}
          {ref && (
            <Card>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Referenzbereiche</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                {ref.ref_min !== undefined && ref.ref_max !== undefined && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-xs text-green-600 dark:text-green-400 font-medium">Referenzbereich</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">
                      {ref.ref_min} – {ref.ref_max} {unit}
                    </p>
                  </div>
                )}
                {ref.optimal_min !== undefined && ref.optimal_max !== undefined && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Optimaler Bereich</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">
                      {ref.optimal_min} – {ref.optimal_max} {unit}
                    </p>
                  </div>
                )}
                {ref.critical_low !== undefined && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">Kritisch niedrig</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">≤ {ref.critical_low} {unit}</p>
                  </div>
                )}
                {ref.critical_high !== undefined && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">Kritisch hoch</p>
                    <p className="font-semibold text-gray-900 dark:text-gray-100 mt-1">≥ {ref.critical_high} {unit}</p>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* History table */}
          <Card padding={false}>
            <div className="p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Messverlauf</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-800">
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Datum</th>
                    <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Wert</th>
                    <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...filteredHistory].reverse().map((h) => {
                    const status = getValueStatus(h.value, ref ?? undefined);
                    return (
                      <tr key={`${h.date}-${h.entryId}`} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{formatDate(h.date)}</td>
                        <td className="px-4 py-3 text-right font-semibold text-gray-900 dark:text-gray-100">
                          {formatNumber(h.value)} <span className="text-xs font-normal text-gray-400">{unit}</span>
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {activeTab === 'info' && ref && (
        <div className="space-y-4">
          <Card>
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Was misst dieser Wert?</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{ref.description}</p>
              </div>
            </div>
          </Card>

          {latestStatus !== 'normal' && latestStatus !== 'unknown' && (
            <Card>
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {latestStatus === 'high' || latestStatus === 'critical_high' ? 'Bedeutung erhöhter Werte' : 'Bedeutung erniedrigter Werte'}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
                    {latestStatus === 'high' || latestStatus === 'critical_high' ? ref.high_info : ref.low_info}
                  </p>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <div className="flex items-start gap-3">
              <Lightbulb className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">Empfehlungen</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{ref.recommendations}</p>
              </div>
            </div>
          </Card>

          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-blue-700 dark:text-blue-400">
              Diese Informationen dienen nur zur Orientierung und ersetzen keine ärztliche Beratung.
              Konsultieren Sie bei Fragen oder Bedenken bitte Ihren Arzt.
            </p>
          </div>

          <Link to="/ai">
            <Button variant="secondary" className="w-full justify-center">
              KI-Doktor zu diesem Wert befragen →
            </Button>
          </Link>
        </div>
      )}

      {activeTab === 'info' && !ref && (
        <Card>
          <p className="text-gray-400 dark:text-gray-500 text-center py-8">
            Keine Referenzinformationen für „{valueName}" verfügbar.
          </p>
        </Card>
      )}
    </div>
  );
}
