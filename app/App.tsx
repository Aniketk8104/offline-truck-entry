import NetInfo, { useNetInfo } from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState, BackHandler } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { Plant } from './src/db/plants';
import { FormScreen } from './src/screens/FormScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { OtpScreen } from './src/screens/OtpScreen';
import { PermissionsScreen } from './src/screens/PermissionsScreen';
import { PlantPinScreen } from './src/screens/PlantPinScreen';
import { registerBackgroundSync } from './src/sync/backgroundTask';
import { syncAllNow, syncNow } from './src/sync/syncEngine';
import { Screen } from './src/ui';

// The app is one short, fixed flow, so the current screen is plain state instead of a router.
type Route =
  | { name: 'permissions' }
  | { name: 'plant' }
  | { name: 'form'; plant: Plant }
  | { name: 'otp'; plant: Plant; submissionId: string; otp: string }
  | { name: 'history' };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'permissions' });
  const net = useNetInfo();
  const offline = net.isConnected === false || net.isInternetReachable === false;

  useSyncTriggers();

  // Android back button: from the form, OTP or History go back to the plant screen.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.name === 'form' || route.name === 'otp' || route.name === 'history') {
        setRoute({ name: 'plant' });
        return true;
      }
      return false; // on the first screens, back closes the app as usual
    });
    return () => sub.remove();
  }, [route.name]);

  const goToPlant = useCallback(() => setRoute({ name: 'plant' }), []);

  let screen: ReactNode;
  switch (route.name) {
    case 'permissions':
      screen = <PermissionsScreen onReady={goToPlant} />;
      break;
    case 'plant':
      screen = <PlantPinScreen onOpen={(plant) => setRoute({ name: 'form', plant })} onHistory={() => setRoute({ name: 'history' })} />;
      break;
    case 'form':
      screen = (
        <FormScreen
          plant={route.plant}
          onSaved={(submissionId, otp) => setRoute({ name: 'otp', plant: route.plant, submissionId, otp })}
          onCancel={goToPlant}
        />
      );
      break;
    case 'otp':
      screen = (
        <OtpScreen
          plant={route.plant}
          submissionId={route.submissionId}
          otp={route.otp}
          onNewEntry={() => setRoute({ name: 'form', plant: route.plant })}
          onHistory={() => setRoute({ name: 'history' })}
          onDone={goToPlant}
        />
      );
      break;
    case 'history':
      screen = <HistoryScreen onBack={goToPlant} />;
      break;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Screen banner={offline ? 'Offline: entries are saved on this phone and sent when the network is back' : null}>
        {screen}
      </Screen>
    </SafeAreaProvider>
  );
}

// Every moment an entry gets sent (F6): the app opens, the app comes back to the front, the
// network comes back, every 30 s while the app is open (for retries that are due), and the
// background task while the app is closed.
function useSyncTriggers() {
  useEffect(() => {
    registerBackgroundSync().catch((err) => console.warn('background sync not available', err));
    syncNow();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') syncNow();
    });

    let wasOnline: boolean | null = null;
    const stopNetInfo = NetInfo.addEventListener((state) => {
      const online = state.isConnected === true && state.isInternetReachable !== false;
      if (online && wasOnline === false) syncAllNow(); // back online: send everything now
      wasOnline = online;
    });

    const timer = setInterval(() => syncNow(), 30_000);
    return () => {
      appState.remove();
      stopNetInfo();
      clearInterval(timer);
    };
  }, []);
}
