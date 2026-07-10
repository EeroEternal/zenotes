import { processSyncQueue } from "./syncEngine";

let started = false;

/** Run sync once; safe to call from anywhere. */
export function requestSync() {
  void processSyncQueue();
}

/** Mount once at app startup to sync when coming back online. */
export function startSyncScheduler() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("online", () => requestSync());
}
