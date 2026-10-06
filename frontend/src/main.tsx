import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { startSyncScheduler } from "./offline/syncScheduler";

registerSW({ immediate: true });

// 新版 Service Worker 接管后自动刷新：否则用户会一直跑旧缓存的 JS，
// 表现为“改了/修了但还是老毛病”
if ("serviceWorker" in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController) window.location.reload();
    hadController = true;
  });
}
startSyncScheduler();

createRoot(document.getElementById("root")!).render(<App />);
