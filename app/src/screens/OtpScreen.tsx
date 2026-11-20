import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { Plant } from '../db/plants';
import { getSubmission, type Submission } from '../db/submissions';
import { onSyncChange } from '../sync/syncEngine';
import { Button, Card, Notice, colors, text } from '../ui';

type Props = {
  plant: Plant;
  submissionId: string;
  otp: string;
  onNewEntry: () => void;
  onHistory: () => void;
  onDone: () => void;
};

// F5: the OTP is shown right after Submit, online or offline. It is the entry's receipt code:
// it is stored with the entry on the phone and in the database.
export function OtpScreen({ plant, submissionId, otp, onNewEntry, onHistory, onDone }: Props) {
  const [entry, setEntry] = useState<Submission | null>(null);

  // Updates live when the sync sends this entry.
  useEffect(() => {
    const load = () => {
      getSubmission(submissionId).then(setEntry);
    };
    load();
    return onSyncChange(load);
  }, [submissionId]);

  const status = entry?.status ?? 'pending';

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <Card>
        <Text style={[text.section, styles.center, { color: colors.ok }]}>✓ Entry saved</Text>
        <Text style={[text.hint, styles.center]}>OTP for this entry</Text>
        <Text style={styles.otp} accessibilityLabel={`OTP ${otp.split('').join(' ')}`}>
          {otp}
        </Text>
        {entry && (
          <Text style={[text.body, styles.center]}>
            {entry.truckNumber} · {entry.personName} · {plant.name}
          </Text>
        )}
      </Card>

      {status === 'pending' && (
        <Notice tone="warn">Saved on this phone. It is sent to the server automatically when the phone is online.</Notice>
      )}
      {status === 'synced' && <Notice tone="ok">Sent to the server.</Notice>}
      {status === 'failed' && <Notice tone="danger">The server refused this entry. History shows the reason.</Notice>}

      <Button title={`New entry for ${plant.name}`} onPress={onNewEntry} />
      <Button secondary title="History" onPress={onHistory} />
      <Button secondary title="Change plant" onPress={onDone} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14, paddingBottom: 24 },
  center: { textAlign: 'center' },
  otp: { fontSize: 52, fontWeight: '700', letterSpacing: 8, color: colors.primary, textAlign: 'center', marginVertical: 4 },
});
