import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking, StyleSheet, Text, View } from 'react-native';
import { Button, colors, text } from '../ui';

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

  if (!camera || !location) return <Text style={text.body}>Checking permissions…</Text>;

  return (
    <View style={styles.list}>
      <Text style={text.title}>Permissions</Text>

      <Row name="Camera" granted={camera.granted} why="Needed for the truck photo. The form can't open without it." />
      {!camera.granted && (
        <Button title={camera.canAskAgain ? 'Allow camera' : 'Open settings to allow camera'} onPress={() => allow('camera')} />
      )}

      <Row
        name="Location"
        granted={location.granted}
        why="Saved with each entry. Without it, entries are saved without a location."
      />
      {!location.granted && (
        <Button
          secondary
          title={location.canAskAgain ? 'Allow location' : 'Open settings to allow location'}
          onPress={() => allow('location')}
        />
      )}

      {camera.granted && !location.granted && <Button title="Continue without location" onPress={onReady} />}
    </View>
  );
}

function Row({ name, granted, why }: { name: string; granted: boolean; why: string }) {
  return (
    <View style={styles.row}>
      <Text style={[text.label, { color: granted ? colors.ok : colors.danger }]}>
        {name}: {granted ? 'allowed' : 'not allowed'}
      </Text>
      {!granted && <Text style={text.hint}>{why}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 14 },
  row: { gap: 4 },
});
