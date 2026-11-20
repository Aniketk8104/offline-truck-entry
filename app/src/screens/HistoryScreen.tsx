import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../config';
import { countByStatus, listSubmissions, type Submission, type SubmissionStatus } from '../db/submissions';
import type { LocationStatus } from '../services/location';
import { onSyncChange, syncAllNow } from '../sync/syncEngine';
import { Button, Notice, Pill, colors, text, type Tone } from '../ui';

type Props = { onBack: () => void };

const STATUS: Record<SubmissionStatus, { label: string; tone: Tone }> = {
  pending: { label: 'Waiting to send', tone: 'warn' },
  synced: { label: 'Sent', tone: 'ok' },
  failed: { label: 'Refused by server', tone: 'danger' },
};

const LOCATION: Record<LocationStatus, string> = {
  ok: 'GPS',
  last_known: 'last known position',
  unavailable: 'no location',
  denied: 'location not allowed',
};

// Every entry on this phone with its OTP and sync status (E4: any number can wait offline).
export function HistoryScreen({ onBack }: Props) {
  const [entries, setEntries] = useState<Submission[]>([]);
  const [counts, setCounts] = useState<Record<SubmissionStatus, number>>({ pending: 0, synced: 0, failed: 0 });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = () => {
      listSubmissions().then(setEntries);
      countByStatus().then(setCounts);
    };
    load();
    return onSyncChange(load);
  }, []);

  async function sendNow() {
    setSending(true);
    try {
      await syncAllNow();
    } finally {
      setSending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={text.title}>History</Text>
      <View style={styles.summary}>
        <Pill label={`${counts.pending} waiting`} tone="warn" />
        <Pill label={`${counts.synced} sent`} tone="ok" />
        {counts.failed > 0 && <Pill label={`${counts.failed} refused`} tone="danger" />}
      </View>
      {!API_URL && <Notice tone="danger">This build has no server address, so nothing can be sent.</Notice>}
      <Button title="Send now" onPress={sendNow} busy={sending} disabled={counts.pending === 0} />

      <FlatList
        style={styles.list}
        data={entries}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => <EntryRow entry={item} />}
        ListEmptyComponent={<Text style={text.hint}>No entries yet.</Text>}
        contentContainerStyle={styles.items}
      />
      <Button secondary title="Back" onPress={onBack} />
    </View>
  );
}

function EntryRow({ entry }: { entry: Submission }) {
  const where = LOCATION[entry.locationStatus] + (entry.locationStatus === 'ok' && entry.accuracy !== null ? ` ±${Math.round(entry.accuracy)} m` : '');
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={text.section}>{entry.truckNumber}</Text>
        <Pill label={STATUS[entry.status].label} tone={STATUS[entry.status].tone} />
      </View>
      <Text style={text.body}>
        {entry.personName} · {entry.plantCode}
      </Text>
      <Text style={text.body}>
        OTP <Text style={styles.otp}>{entry.otp}</Text>
      </Text>
      <Text style={text.hint}>
        {new Date(entry.capturedAt).toLocaleString()} · {where}
      </Text>
      {entry.status !== 'synced' && entry.lastError && (
        <Text style={entry.status === 'failed' ? text.error : text.hint}>
          {entry.status === 'pending' ? `Last try (${entry.attempts}): ` : ''}
          {entry.lastError}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12, paddingBottom: 12 },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  list: { flex: 1 },
  items: { gap: 10, paddingVertical: 4 },
  card: { backgroundColor: colors.white, borderRadius: 12, borderWidth: 1, borderColor: colors.divider, padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  otp: { fontWeight: '700', color: colors.primary, letterSpacing: 2 },
});
