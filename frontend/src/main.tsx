import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { startSyncScheduler } from "./offline/syncScheduler";

registerSW({ immediate: true });
startSyncScheduler();

createRoot(document.getElementById("root")!).render(<App />);
