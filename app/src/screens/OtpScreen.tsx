import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Plant } from '../db/plants';
import { getSubmission, type SubmissionStatus } from '../db/submissions';
import { onSyncChange } from '../sync/syncEngine';
import { Button, colors, text } from '../ui';

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
  const [status, setStatus] = useState<SubmissionStatus>('pending');

  // Updates live when the sync sends this entry.
  useEffect(() => {
    const load = () => {
      getSubmission(submissionId).then((s) => s && setStatus(s.status));
    };
    load();
    return onSyncChange(load);
  }, [submissionId]);

  return (
    <View style={styles.list}>
      <Text style={text.title}>Entry saved</Text>
      <Text style={text.hint}>OTP for this entry</Text>
      <Text style={styles.otp} accessibilityLabel={`OTP ${otp.split('').join(' ')}`}>
        {otp}
      </Text>
      {status === 'pending' && (
        <Text style={text.warn}>Saved on this phone. It is sent to the server automatically when the phone is online.</Text>
      )}
      {status === 'synced' && <Text style={[text.body, { color: colors.ok }]}>Sent to the server.</Text>}
      {status === 'failed' && <Text style={text.error}>The server refused this entry. See History for the reason.</Text>}

      <Button title={`New entry for ${plant.name}`} onPress={onNewEntry} />
      <Button secondary title="History" onPress={onHistory} />
      <Button secondary title="Change plant" onPress={onDone} />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  otp: { fontSize: 52, fontWeight: '700', letterSpacing: 8, color: colors.primary, textAlign: 'center', marginVertical: 8 },
});
