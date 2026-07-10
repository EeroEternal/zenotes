import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
        /** 避免部分环境下 POST 二进制体或 Cookie 未正确传到 Wrangler */
        configure(proxy) {
          proxy.on("proxyReq", (proxyReq, req) => {
            const ct = req.headers["content-type"];
            if (ct) proxyReq.setHeader("Content-Type", ct);
            const cl = req.headers["content-length"];
            if (cl) proxyReq.setHeader("Content-Length", cl);
            const cookie = req.headers["cookie"];
            if (cookie) proxyReq.setHeader("Cookie", cookie);
          });
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: false,
      devOptions: { enabled: false },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2,json}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.zenotes\.site\/api\/notes/,
            handler: "NetworkFirst",
            options: { cacheName: "api-notes" },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
