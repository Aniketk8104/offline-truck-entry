import { Picker } from '@react-native-picker/picker';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { listPlants, type Plant } from '../db/plants';
import { countPending } from '../db/submissions';
import { checkPin, getLockedUntil, LOCK_MINUTES, MAX_WRONG_TRIES } from '../services/pin';
import { onSyncChange } from '../sync/syncEngine';
import { Button, colors, text } from '../ui';

type Props = { onOpen: (plant: Plant) => void; onHistory: () => void };

// F3 and E2: choose a plant and enter its PIN. Checked on the phone, so it works offline.
export function PlantPinScreen({ onOpen, onHistory }: Props) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [pending, setPending] = useState(0);
  const [plantCode, setPlantCode] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [checking, setChecking] = useState(false);

  // The plant list and the "waiting to send" count, reloaded whenever a sync changes them.
  useEffect(() => {
    const load = () => {
      listPlants().then(setPlants);
      countPending().then(setPending);
    };
    load();
    return onSyncChange(load);
  }, []);

  // Choosing a plant clears the PIN but keeps that plant's lock (the lock is stored in SQLite).
  useEffect(() => {
    setPin('');
    setMessage(null);
    setLockedUntil(0);
    if (plantCode) getLockedUntil(plantCode).then(setLockedUntil);
  }, [plantCode]);

  // While locked, tick every second for the countdown.
  useEffect(() => {
    if (lockedUntil === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) setLockedUntil(0);
    }, 1000);
    return () => clearInterval(timer);
  }, [lockedUntil]);

  const plant = plants.find((p) => p.code === plantCode);
  const locked = lockedUntil > now;

  async function openForm() {
    if (!plant || pin.length !== 4) return;
    setChecking(true);
    const check = await checkPin(plant.code, pin);
    setChecking(false);
    setPin('');
    if (check.result === 'ok') {
      setMessage(null);
      onOpen(plant);
    } else if (check.result === 'locked') {
      setNow(Date.now());
      setLockedUntil(check.lockedUntil);
      setMessage(null);
    } else {
      setMessage(`Wrong PIN for ${plant.name}. ${check.triesLeft} ${check.triesLeft === 1 ? 'try' : 'tries'} left.`);
    }
  }

  return (
    <View style={styles.list}>
      <Text style={text.title}>Truck entry</Text>

      <Text style={text.label}>Plant / location</Text>
      <View style={styles.pickerBox}>
        <Picker selectedValue={plantCode} onValueChange={(value) => setPlantCode(String(value))} mode="dropdown">
          <Picker.Item label="Select a plant" value="" color={colors.muted} />
          {plants.map((p) => (
            <Picker.Item key={p.code} label={p.name} value={p.code} />
          ))}
        </Picker>
      </View>

      <Text style={text.label}>PIN</Text>
      <TextInput
        style={text.input}
        value={pin}
        onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
        keyboardType="number-pad"
        secureTextEntry
        maxLength={4}
        placeholder={plant ? '4 digits' : 'Select a plant first'}
        editable={!!plant && !locked}
      />
      {locked ? (
        <Text style={text.error}>
          Too many wrong PINs for {plant?.name}. Try again in {formatRemaining(lockedUntil - now)}.
        </Text>
      ) : message ? (
        <Text style={text.error}>{message}</Text>
      ) : (
        <Text style={text.hint}>
          After {MAX_WRONG_TRIES} wrong PINs the plant is locked for {LOCK_MINUTES} minutes.
        </Text>
      )}

      <Button title="Open form" onPress={openForm} disabled={!plant || pin.length !== 4 || locked} busy={checking} />
      <Button secondary title={pending > 0 ? `History (${pending} waiting to send)` : 'History'} onPress={onHistory} />
    </View>
  );
}

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  list: { gap: 12 },
  pickerBox: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, backgroundColor: colors.white },
});
