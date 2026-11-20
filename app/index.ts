import { registerRootComponent } from 'expo';
import App from './App';
// Defines the background sync task. It must run as soon as the code loads, outside any screen,
// because Android may start the app in the background just to run it.
import './src/sync/backgroundTask';

registerRootComponent(App);
