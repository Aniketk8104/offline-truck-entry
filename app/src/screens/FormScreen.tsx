import * as Crypto from 'expo-crypto';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Plant } from '../db/plants';
import { insertSubmission } from '../db/submissions';
import { readLocation, type LocationReading } from '../services/location';
import { generateOtp } from '../services/otp';
import { keepPhoto, takePhoto } from '../services/photo';
import { cleanTruckNumber, nameProblem, truckProblem } from '../services/validation';
import { syncNow } from '../sync/syncEngine';
import { Button, colors, text } from '../ui';

type Props = { plant: Plant; onSaved: (submissionId: string, otp: string) => void; onCancel: () => void };

// F4: name, truck number, a photo from the camera, and the location filled in automatically.
export function FormScreen({ plant, onSaved, onCancel }: Props) {
  const [name, setName] = useState('');
  const [truck, setTruck] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [location, setLocation] = useState<LocationReading | null>(null); // null = still looking
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);

  // The location search starts as soon as the form opens, while the user types (E3).
  async function locate() {
    setLocation(null);
    setLocation(await readLocation());
  }
  useEffect(() => {
    locate();
  }, []);

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

  // F5 and F6: saved on the phone first, online or not. The OTP is shown right away.
  async function submit() {
    setShowProblems(true);
    if (!complete || !photoUri || !location || saving) return;
    setSaving(true); // also stops a double tap from saving two entries
    try {
      // Made once, here. Every retry sends this same id, so the server saves the entry only once (E6).
      const id = Crypto.randomUUID();
      const otp = generateOtp();
      const savedPhotoUri = await keepPhoto(photoUri, id);
      await insertSubmission({
        id,
        plantCode: plant.code,
        personName: name.trim(),
        truckNumber: cleanTruckNumber(truck),
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
      setSaving(false);
      Alert.alert('Not saved', 'The entry could not be saved on this phone. Please try again.');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
      <Text style={text.title}>{plant.name}</Text>

      <Text style={text.label}>Name</Text>
      <TextInput style={text.input} value={name} onChangeText={setName} placeholder="Driver or person name" maxLength={100} />
      {showProblems && problems.name && <Text style={text.error}>{problems.name}</Text>}

      <Text style={text.label}>Truck number</Text>
      <TextInput
        style={text.input}
        value={truck}
        onChangeText={setTruck}
        placeholder="e.g. MH09AB1234"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={20}
      />
      {showProblems && problems.truck && <Text style={text.error}>{problems.truck}</Text>}

      <Text style={text.label}>Photo</Text>
      {photoUri && <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />}
      <Button secondary title={photoUri ? 'Retake photo' : 'Take photo'} onPress={onTakePhoto} />
      {showProblems && problems.photo && <Text style={text.error}>{problems.photo}</Text>}

      <Text style={text.label}>Location</Text>
      <LocationInfo location={location} onRetry={locate} />

      <Button title={location ? 'Submit' : 'Waiting for location…'} onPress={submit} disabled={!location} busy={saving} />
      <Button secondary title="Cancel" onPress={onCancel} disabled={saving} />
    </ScrollView>
  );
}

function LocationInfo({ location, onRetry }: { location: LocationReading | null; onRetry: () => void }) {
  if (!location) {
    return (
      <View style={styles.row}>
        <ActivityIndicator color={colors.primary} />
        <Text style={text.body}>Getting location… (up to 15 s)</Text>
      </View>
    );
  }
  const where =
    location.latitude !== null && location.longitude !== null
      ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` +
        (location.accuracy !== null ? ` (±${Math.round(location.accuracy)} m)` : '')
      : '';
  return (
    <View style={styles.locationBox}>
      {location.status === 'ok' && <Text style={text.body}>{where}</Text>}
      {location.status === 'last_known' && (
        <Text style={text.warn}>No fresh GPS fix. Using the last known position from the past 5 minutes: {where}</Text>
      )}
      {location.status === 'unavailable' && (
        <Text style={text.warn}>Location not available (GPS off, indoors or slow). The entry can be saved without it.</Text>
      )}
      {location.status === 'denied' && (
        <Text style={text.warn}>Location permission is off. The entry will be saved without a location.</Text>
      )}
      {location.mocked && <Text style={text.error}>This position comes from a mock-location app.</Text>}
      {(location.status === 'last_known' || location.status === 'unavailable') && (
        <Button secondary title="Try again" onPress={onRetry} />
      )}
      {location.status === 'denied' && <Button secondary title="Open settings" onPress={() => Linking.openSettings()} />}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 10, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  photo: { width: '100%', height: 200, borderRadius: 8, backgroundColor: colors.border },
  locationBox: { gap: 8 },
});
