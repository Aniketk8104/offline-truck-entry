import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { syncNow } from './syncEngine';

const TASK_NAME = 'send-saved-truck-entries';

// Runs the same sync when the app is closed. Android schedules it with WorkManager: at most about
// every 15 minutes, at a time the system chooses, and the schedule survives a phone restart (E5).
// It must be defined when the code loads (index.ts imports this file), not inside a screen,
// because Android may start the app in the background only to run this task.
TaskManager.defineTask(TASK_NAME, async () => {
  await syncNow();
  return BackgroundTask.BackgroundTaskResult.Success;
});

export async function registerBackgroundSync(): Promise<void> {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (!(await TaskManager.isTaskRegisteredAsync(TASK_NAME))) {
    await BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 15 }); // minutes
  }
}
