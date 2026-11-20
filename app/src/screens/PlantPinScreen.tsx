import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { listPlants, type Plant } from '../db/plants';
import { checkPin, getLockedUntil, LOCK_MINUTES, MAX_WRONG_TRIES } from '../services/pin';
import { onSyncChange } from '../sync/syncEngine';
import { Button, Card, Dropdown, Field, Input, text } from '../ui';

type Props = { onOpen: (plant: Plant) => void; onHistory: () => void };

// F3 and E2: choose a plant and enter its PIN. Checked on the phone, so it works offline.
export function PlantPinScreen({ onOpen, onHistory }: Props) {
  const [plants, setPlants] = useState<Plant[]>([]);
  const [plantCode, setPlantCode] = useState('');
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [checking, setChecking] = useState(false);
  const checkingRef = useRef(false); // a double tap must count as one try, not two

  // The plant list, reloaded when a sync refreshes it from the server.
  useEffect(() => {
    const load = () => {
      listPlants().then(setPlants);
    };
    load();
    return onSyncChange(load);
  }, []);

  // Choosing a plant clears the PIN but keeps that plant's lock (the lock is stored in SQLite).
  useEffect(() => {
    let current = true; // ignore a slow answer for a plant that is no longer selected
    setPin('');
    setMessage(null);
    setLockedUntil(0);
    if (plantCode) {
      getLockedUntil(plantCode).then((until) => {
        if (!current) return;
        setNow(Date.now());
        setLockedUntil(until);
      });
    }
    return () => {
      current = false;
    };
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
    if (!plant || pin.length !== 4 || locked || checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const check = await checkPin(plant.code, pin);
      setPin('');
      if (check.result === 'ok') {
        setMessage(null);
        onOpen(plant);
      } else if (check.result === 'locked') {
        setMessage(null);
        setNow(Date.now());
        setLockedUntil(check.lockedUntil);
      } else {
        setMessage(`Wrong PIN for ${plant.name}. ${check.triesLeft} ${check.triesLeft === 1 ? 'try' : 'tries'} left.`);
      }
    } catch {
      setMessage('The PIN could not be checked. Please try again.');
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }

  const pinError = locked
    ? `Too many wrong PINs for ${plant?.name}. Try again in ${formatRemaining(lockedUntil - now)}.`
    : message;

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <View>
        <Text style={text.title}>Select plant</Text>
        <Text style={text.subtitle}>Choose the plant / location and enter its PIN to open the form.</Text>
      </View>

      <Card>
        <Field label="Plant / location">
          <Dropdown
            placeholder="Select a plant"
            options={plants.map((p) => ({ value: p.code, label: p.name }))}
            value={plantCode}
            onChange={setPlantCode}
          />
        </Field>
        <Field label="PIN" error={pinError} hint={`After ${MAX_WRONG_TRIES} wrong PINs the plant is locked for ${LOCK_MINUTES} minutes.`}>
          <Input
            value={pin}
            onChangeText={(value) => setPin(value.replace(/\D/g, '').slice(0, 4))}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            placeholder={plant ? '4 digits' : 'Select a plant first'}
            editable={!!plant && !locked}
            returnKeyType="done"
            onSubmitEditing={openForm}
            style={pin ? styles.pin : undefined}
          />
        </Field>
        <Button title="Open form" onPress={openForm} disabled={!plant || pin.length !== 4 || locked} busy={checking} />
      </Card>

      <Button secondary title="History" onPress={onHistory} />
    </ScrollView>
  );
}

function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  list: { gap: 14, paddingBottom: 24 },
  pin: { fontSize: 22, letterSpacing: 8 },
});
