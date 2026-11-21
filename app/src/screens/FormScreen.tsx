import * as Crypto from 'expo-crypto';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { ActivityIndicator, Alert, BackHandler, Image, Linking, ScrollView, StyleSheet, Text, type TextInput, View } from 'react-native';
import type { Plant } from '../db/plants';
import { insertSubmission } from '../db/submissions';
import { FIX_TIMEOUT_MS, isLocationOn, readLocation, turnOnLocation, type LocationReading } from '../services/location';
import { generateOtp } from '../services/otp';
import { keepPhoto, takePhoto } from '../services/photo';
import { cleanTruckNumber, nameProblem, truckProblem } from '../services/validation';
import { syncNow } from '../sync/syncEngine';
import { Button, Card, Field, Input, Notice, Pill, colors, text } from '../ui';

type Props = { plant: Plant; onSaved: (submissionId: string, otp: string) => void; onCancel: () => void };

// F4: name, truck number, a photo from the camera, and the location filled in automatically.
export function FormScreen({ plant, onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [truck, setTruck] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationReading | null>(null); // null = still looking
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // a double tap must save one entry, not two
  const truckInput = useRef<ComponentRef<typeof TextInput>>(null);

  // The location search starts as soon as the form opens, while the user types (E3). Each search gets
  // a number, so an older, slower search can never overwrite the result of a newer one.
  const search = useRef(0);
  const [searchStartedAt, setSearchStartedAt] = useState(Date.now());
  async function locate() {
    const id = ++search.current;
    setLocation(null);
    setSearchStartedAt(Date.now());
    const reading = await readLocation();
    if (id === search.current) setLocation(reading);
  }
  useEffect(() => {
    locate();
  }, []);

  // While location is switched off, check every 2 s: once it is on (from the button's dialog or the
  // quick settings), the search starts again by itself.
  const waitingForLocationOn = location?.status === 'unavailable' && location.servicesOff;
  useEffect(() => {
    if (!waitingForLocationOn) return;
    let active = true;
    const timer = setInterval(() => {
      isLocationOn().then((on) => {
        if (on && active) locate();
      });
    }, 2_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [waitingForLocationOn]);

  // Back or Cancel with something filled in asks first, so a slip of the thumb doesn't lose the photo.
  const dirty = name.trim() !== '' || truck.trim() !== '' || photoUri !== null;
  function leave() {
    if (savingRef.current) return;
    if (!dirty) {
      onCancel();
      return;
    }
    Alert.alert('Discard this entry?', 'The name, truck number and photo will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onCancel },
    ]);
  }
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [dirty]);

  async function onTakePhoto() {
    try {
      const uri = await takePhoto();
      if (uri) setPhotoUri(uri);
    } catch {
      Alert.alert('Camera problem', 'The photo could not be taken. Check that the camera is allowed in Settings.', [
        { text: 'Open settings', onPress: () => Linking.openSettings() },
        { text: 'OK' },
      ]);
    }
  }

  const problems = {
    name: nameProblem(name),
    truck: truckProblem(truck),
    photo: photoUri ? null : 'Take a photo of the truck',
  };
  const complete = !problems.name && !problems.truck && !problems.photo;
  const cleanedTruck = cleanTruckNumber(truck);
  const truckHint = truck && cleanedTruck !== truck ? `Saved as ${cleanedTruck}` : null;

  // F5 and F6: saved on the phone first, online or not. The OTP is shown right away.
  async function submit() {
    setShowProblems(true);
    if (!complete || !photoUri || !location || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      // Made once, here. Every retry sends this same id, so the server saves the entry only once (E6).
      const id = Crypto.randomUUID();
      const otp = generateOtp();
      const savedPhotoUri = await keepPhoto(photoUri, id);
      await insertSubmission({
        id,
        plantCode: plant.code,
        personName: name.trim(),
        truckNumber: cleanedTruck,
        photoUri: savedPhotoUri,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        locationStatus: location.status,
        locationMocked: location.mocked,
        otp,
        capturedAt: new Date().toISOString(),
      });
      syncNow(); // sends it now if online; otherwise it waits safely in SQLite
      onSaved(id, otp);
    } catch {
      savingRef.current = false;
      setSaving(false);
      Alert.alert('Not saved', 'The entry could not be saved on this phone. Please try again.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <Text style={text.title}>New entry</Text>
        <Pill label={plant.name} tone="info" />
      </View>

      <Card>
        <Field label="Name" error={showProblems ? problems.name : null}>
          <Input
            value={name}
            onChangeText={setName}
            placeholder="Driver or person name"
            maxLength={100}
            autoCapitalize="words"
            returnKeyType="next"
            submitBehavior="submit"
            onSubmitEditing={() => truckInput.current?.focus()}
          />
        </Field>
        <Field label="Truck number" error={showProblems ? problems.truck : null} hint={truckHint}>
          <Input
            ref={truckInput}
            value={truck}
            onChangeText={setTruck}
            placeholder="e.g. MH09AB1234"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={20}
          />
        </Field>
      </Card>

      <Card>
        <Field label="Photo" error={showProblems ? problems.photo : null}>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
          ) : (
            <View style={[styles.photo, styles.noPhoto]}>
              <Text style={text.hint}>No photo yet</Text>
            </View>
          )}
        </Field>
        <Button secondary={!!photoUri} title={photoUri ? 'Retake photo' : 'Take photo'} onPress={onTakePhoto} />
      </Card>

      <Card>
        <Text style={text.label}>Location</Text>
        <LocationInfo location={location} searchStartedAt={searchStartedAt} onRetry={locate} />
      </Card>

      <Button title={location ? 'Submit' : 'Waiting for location…'} onPress={submit} disabled={!location} busy={saving} />
      <Button secondary title="Cancel" onPress={leave} disabled={saving} />
    </ScrollView>
  );
}

type LocationInfoProps = { location: LocationReading | null; searchStartedAt: number; onRetry: () => void };

function LocationInfo({ location, searchStartedAt, onRetry }: LocationInfoProps) {
  if (!location) return <Searching startedAt={searchStartedAt} />;
  const where =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` +
        (location.accuracy !== null ? ` (±${Math.round(location.accuracy)} m)` : '')
      : '';

  return (
    <View style={styles.locationBox}>
      {location.status === 'ok' && <Notice tone="ok">{where}</Notice>}
      {location.status === 'last_known' && (
        <Notice tone="warn">{`No fresh GPS fix. Using the last known position from the past 5 minutes: ${where}`}</Notice>
      )}
      {location.status === 'unavailable' && (
        <Notice tone="warn">
          {location.servicesOff
            ? 'Location is turned off on this phone. Once it is on, the position is found by itself. You can also submit without a location.'
            : 'No location found in 15 s (indoors or weak GPS). Try again, or submit without a location.'}
        </Notice>
      )}
      {location.status === 'denied' && (
        <Notice tone="warn">Location permission is off, so the entry is saved without a location.</Notice>
      )}
      {location.mocked && <Notice tone="danger">This position comes from a mock-location app. It is saved and flagged.</Notice>}

      {location.status === 'unavailable' && location.servicesOff && (
        // Android's own "Turn on location" dialog; if the user says no, nothing changes.
        <Button title="Turn on location" onPress={() => turnOnLocation().then(onRetry, () => undefined)} />
      )}
      {(location.status === 'last_known' || (location.status === 'unavailable' && !location.servicesOff)) && (
        <Button secondary title="Try again" onPress={onRetry} />
      )}
      {location.status === 'denied' && <Button secondary title="Open settings" onPress={() => Linking.openSettings()} />}
    </View>
  );
}

// A seconds counter, so a slow first GPS fix doesn't look like a frozen screen.
function Searching({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return (
    <View style={styles.row}>
      <ActivityIndicator color={colors.primary} />
      <Text style={text.body}>
        Getting location… {seconds} s (up to {FIX_TIMEOUT_MS / 1000} s)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14, paddingBottom: 24 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photo: { width: '100%', height: 200, borderRadius: 8, backgroundColor: colors.divider },
  noPhoto: { alignItems: 'center', justifyContent: 'center' },
  locationBox: { gap: 10 },
});
