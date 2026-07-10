import { processSyncQueue } from "./syncEngine";

let started = false;

/** Run sync once; safe to call from anywhere. */
export function requestSync() {
  void processSyncQueue();
}

/** Mount once at app startup to sync when coming online. */
export function startSyncScheduler() {
  if (started || typeof window === "undefined") return;
  started = true;

  const onOnline = () => requestSync();
  window.addEventListener("online", onOnline);
  if (navigator.onLine) {
    requestSync();
  }
}
