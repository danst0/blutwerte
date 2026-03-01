import React, { useEffect, useState } from 'react';
import { shares as sharesApi } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/Badge';
import { TrafficDot } from '@/components/TrafficLight';
import { ShareDialog } from '@/components/ShareDialog';
import { getValueStatus, formatDate, formatNumber } from '@/lib/utils';
import type { Share, ReceivedShare, BloodEntry, ReferenceValue, Gender } from '@/types';
import {
  Users,
  Share2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Calendar,
  ArrowLeft,
  Plus,
  Clock,
  Eye,
} from 'lucide-react';

type Tab = 'received' | 'given';

export default function SharedData() {
  const [tab, setTab] = useState<Tab>('received');
  const [givenShares, setGivenShares] = useState<Share[]>([]);
  const [receivedShares, setReceivedShares] = useState<ReceivedShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);

  // Detail view state
  const [viewingShare, setViewingShare] = useState<ReceivedShare | null>(null);
  const [sharedEntries, setSharedEntries] = useState<BloodEntry[]>([]);
  const [sharedGender, setSharedGender] = useState<Gender | undefined>();
  const [refDb, setRefDb] = useState<Record<string, ReferenceValue>>({});
  const [detailLoading, setDetailLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadShares = async () => {
    try {
      const [given, received] = await Promise.all([
        sharesApi.getGiven(),
        sharesApi.getReceived(),
      ]);
      setGivenShares(given);
      setReceivedShares(received);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShares();
  }, []);

  const revokeShare = async (id: string) => {
    if (!confirm('Diesen Share wirklich widerrufen?')) return;
    setRevoking(id);
    try {
      await sharesApi.revoke(id);
      setGivenShares((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setRevoking(null);
    }
  };

  const viewSharedData = async (share: ReceivedShare) => {
    setDetailLoading(true);
    setViewingShare(share);
    try {
      const [data, refs] = await Promise.all([
        sharesApi.getSharedData(share.share_id),
        sharesApi.getSharedReference(share.share_id),
      ]);
      setSharedEntries(data.entries);
      setSharedGender(data.gender);
      const map: Record<string, ReferenceValue> = {};
      refs.values.forEach((r) => { map[r.name] = r; });
      setRefDb(map);
    } catch {
      setViewingShare(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleEntry = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const formatExpiry = (expiresAt?: string) => {
    if (!expiresAt) return 'Unbegrenzt';
    const d = new Date(expiresAt);
    return `bis ${d.toLocaleDateString('de-DE')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Detail view for shared data
  if (viewingShare) {
    return (
      <div className="space-y-6 animate-slide-up">
        <div className="flex items-center gap-4">
          <button
            onClick={() => { setViewingShare(null); setExpanded(new Set()); }}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
              {viewingShare.owner_display_name}
            </h1>
            <p className="text-gray-500 dark:text-gray-400 text-sm flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              Geteilt am {new Date(viewingShare.created_at).toLocaleDateString('de-DE')} · {formatExpiry(viewingShare.expires_at)}
            </p>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sharedEntries.length === 0 ? (
          <Card className="text-center py-16">
            <p className="text-gray-500 dark:text-gray-400">Keine Einträge vorhanden</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {sharedEntries.map((entry) => {
              const isOpen = expanded.has(entry.id);
              const abnormal = entry.values.filter((v) => {
                const s = getValueStatus(v.value, refDb[v.name], sharedGender);
                return s !== 'normal' && s !== 'unknown';
              });

              return (
                <Card key={entry.id} padding={false} className="overflow-hidden">
                  <button
                    onClick={() => toggleEntry(entry.id)}
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
                          {entry.values.length} Werte
                        </span>
                        <div className="flex gap-1">
                          {entry.values.slice(0, 6).map((v) => (
                            <TrafficDot
                              key={v.name}
                              status={getValueStatus(v.value, refDb[v.name], sharedGender)}
                              size="sm"
                            />
                          ))}
                          {entry.values.length > 6 && (
                            <span className="text-xs text-gray-400">+{entry.values.length - 6}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>

                  {isOpen && (
                    <div className="border-t border-gray-200 dark:border-gray-800 p-4">
                      {entry.notes && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 italic">
                          {entry.notes}
                        </p>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {entry.values.map((v) => {
                          const status = getValueStatus(v.value, refDb[v.name], sharedGender);
                          return (
                            <div
                              key={v.name}
                              className="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-800"
                            >
                              <div className="min-w-0">
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{v.long_name || v.name}</p>
                                {v.long_name && v.long_name !== v.name && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{v.name}</p>
                                )}
                                <p className="font-semibold text-gray-900 dark:text-gray-100">
                                  {formatNumber(v.value)} <span className="text-xs font-normal text-gray-400">{v.unit}</span>
                                </p>
                              </div>
                              <StatusBadge status={status} />
                            </div>
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

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Geteilte Daten</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Blutwerte teilen und geteilte Daten einsehen</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        <button
          onClick={() => setTab('received')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'received'
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Eye className="w-4 h-4" />
          Mit mir geteilt
          {receivedShares.length > 0 && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full text-xs">
              {receivedShares.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab('given')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            tab === 'given'
              ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          <Share2 className="w-4 h-4" />
          Von mir geteilt
          {givenShares.length > 0 && (
            <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded-full text-xs">
              {givenShares.length}
            </span>
          )}
        </button>
      </div>

      {/* Received Tab */}
      {tab === 'received' && (
        receivedShares.length === 0 ? (
          <Card className="text-center py-16">
            <Users className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Noch niemand hat Daten mit dir geteilt</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {receivedShares.map((share) => (
              <Card key={share.share_id} padding={false}>
                <button
                  onClick={() => viewSharedData(share)}
                  className="w-full flex items-center gap-4 p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 dark:text-gray-100">
                      {share.owner_display_name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatExpiry(share.expires_at)}
                    </p>
                  </div>
                  <Eye className="w-5 h-5 text-gray-400" />
                </button>
              </Card>
            ))}
          </div>
        )
      )}

      {/* Given Tab */}
      {tab === 'given' && (
        <>
          <div className="flex justify-end">
            <Button
              icon={<Plus className="w-4 h-4" />}
              size="sm"
              onClick={() => setDialogOpen(true)}
            >
              Neuen Share erstellen
            </Button>
          </div>

          {givenShares.length === 0 ? (
            <Card className="text-center py-16">
              <Share2 className="w-16 h-16 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">Du hast noch keine Daten geteilt</p>
              <Button
                className="mt-4"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setDialogOpen(true)}
              >
                Jetzt teilen
              </Button>
            </Card>
          ) : (
            <div className="space-y-3">
              {givenShares.map((share) => (
                <Card key={share.id} padding={false}>
                  <div className="flex items-center gap-4 p-4">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                      <Share2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                        {share.shared_with_email}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(share.created_at).toLocaleDateString('de-DE')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatExpiry(share.expires_at)}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeShare(share.id)}
                      loading={revoking === share.id}
                      icon={<Trash2 className="w-4 h-4" />}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                    >
                      Widerrufen
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      <ShareDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={loadShares}
      />
    </div>
  );
}
