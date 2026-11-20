import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Pill, colors, text } from '../ui';

type Permission = { granted: boolean; canAskAgain: boolean };
type Props = { onReady: () => void };

// F2 and E1. On first launch the app asks for both permissions. The camera is required (the photo
// is mandatory). Without location the app still works and saves the entry as "denied".
export function PermissionsScreen({ onReady }: Props) {
  const [camera, setCamera] = useState<Permission | null>(null);
  const [location, setLocation] = useState<Permission | null>(null);

  // Android shows its own dialog only for a permission the user hasn't decided on yet.
  const check = useCallback(
    async (askIfUndecided: boolean) => {
      let cam = await ImagePicker.getCameraPermissionsAsync();
      if (askIfUndecided && cam.status === 'undetermined') cam = await ImagePicker.requestCameraPermissionsAsync();
      let loc = await Location.getForegroundPermissionsAsync();
      if (askIfUndecided && loc.status === 'undetermined') loc = await Location.requestForegroundPermissionsAsync();
      setCamera(cam);
      setLocation(loc);
      if (cam.granted && loc.granted) onReady();
    },
    [onReady],
  );

  useEffect(() => {
    check(true);
    // The user may switch a permission on in Android settings and come back: check again.
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check(false);
    });
    return () => sub.remove();
  }, [check]);

  // After two refusals Android stops showing the dialog ("don't ask again"); only settings can fix it.
  async function allow(kind: 'camera' | 'location') {
    const current = kind === 'camera' ? camera : location;
    if (current?.canAskAgain) {
      if (kind === 'camera') await ImagePicker.requestCameraPermissionsAsync();
      else await Location.requestForegroundPermissionsAsync();
      await check(false);
    } else {
      await Linking.openSettings();
    }
  }

  if (!camera || !location) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={text.hint}>Checking permissions…</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <View>
        <Text style={text.title}>Permissions</Text>
        <Text style={text.subtitle}>The camera takes the truck photo. The location is saved with each entry.</Text>
      </View>
      <PermissionCard
        name="Camera"
        required
        permission={camera}
        why="Required: the form can't open without it, because the photo is mandatory."
        onAllow={() => allow('camera')}
      />
      <PermissionCard
        name="Location"
        required={false}
        permission={location}
        why="Optional: without it, entries are saved without a location."
        onAllow={() => allow('location')}
      />
      {camera.granted && !location.granted && <Button title="Continue without location" onPress={onReady} />}
    </ScrollView>
  );
}

type PermissionCardProps = { name: string; required: boolean; permission: Permission; why: string; onAllow: () => void };

function PermissionCard({ name, required, permission, why, onAllow }: PermissionCardProps) {
  return (
    <Card>
      <View style={styles.row}>
        <Text style={text.section}>{name}</Text>
        <Pill label={permission.granted ? 'Allowed' : 'Not allowed'} tone={permission.granted ? 'ok' : 'danger'} />
      </View>
      {!permission.granted && (
        <>
          <Text style={text.hint}>{why}</Text>
          <Button
            secondary={!required}
            title={permission.canAskAgain ? `Allow ${name.toLowerCase()}` : `Open settings to allow ${name.toLowerCase()}`}
            onPress={onAllow}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14, paddingBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
});
