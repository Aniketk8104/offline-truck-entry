import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { API_URL } from '../config';
import { listSubmissions, type Submission } from '../db/submissions';
import { onSyncChange, syncAllNow } from '../sync/syncEngine';
import { Button, colors, text } from '../ui';

type Props = { onBack: () => void };

const STATUS_LABEL = { pending: 'Waiting to send', synced: 'Sent', failed: 'Refused by server' } as const;
const STATUS_COLOR = { pending: colors.warn, synced: colors.ok, failed: colors.danger } as const;

// Every entry on this phone with its OTP and sync status (E4: any number can wait offline).
export function HistoryScreen({ onBack }: Props) {
  const [entries, setEntries] = useState<Submission[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const load = () => {
      listSubmissions().then(setEntries);
    };
    load();
    return onSyncChange(load);
  }, []);

  const waiting = entries.filter((e) => e.status === 'pending').length;

  async function sendNow() {
    setSending(true);
    await syncAllNow();
    setSending(false);
  }

  return (
    <View style={styles.screen}>
      <Text style={text.title}>History</Text>
      <Text style={text.body}>
        {waiting} waiting to send · {entries.length} on this phone
      </Text>
      {!API_URL && <Text style={text.error}>This build has no server address, so nothing can be sent.</Text>}
      <Button title="Send now" onPress={sendNow} busy={sending} disabled={waiting === 0} />

      <FlatList
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
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={text.label}>{entry.truckNumber}</Text>
        <Text style={[text.label, { color: STATUS_COLOR[entry.status] }]}>{STATUS_LABEL[entry.status]}</Text>
      </View>
      <Text style={text.body}>
        {entry.personName} · {entry.plantCode} · OTP {entry.otp}
      </Text>
      <Text style={text.hint}>
        {new Date(entry.capturedAt).toLocaleString()} · location: {entry.locationStatus}
      </Text>
      {entry.status !== 'synced' && entry.lastError && (
        <Text style={text.hint}>
          {entry.status === 'pending' ? `Last try (${entry.attempts}): ` : ''}
          {entry.lastError}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, gap: 12 },
  items: { gap: 10, paddingVertical: 4 },
  card: { backgroundColor: colors.white, borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 4 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
});
