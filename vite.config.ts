/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import net from "node:net";
import path from "path";
import authHandler from "./api/auth";

// Node gives each resolved address only 250ms before moving on, so a slow network makes every
// Supabase IP time out (AggregateError ETIMEDOUT) even though the host is reachable.
net.setDefaultAutoSelectFamilyAttemptTimeout(2000);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "VITE_");
  return {
    server: {
      host: "::",
      port: 8080,
      proxy: {
        "/supabase-api": {
          target: env.VITE_SUPABASE_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/supabase-api/, ""),
        },
      },
    },
    plugins: [
      react(),
      {
        name: "auth-bff",
        configureServer(server) {
          process.env.VITE_SUPABASE_URL ??= env.VITE_SUPABASE_URL;
          server.middlewares.use("/api/auth", (req, res) => {
            authHandler(req, res).catch((err) => {
              console.error(err);
              res.statusCode = 502;
              res.end();
            });
          });
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: "/",
    test: {
      environment: "node",
      include: ["src/**/__tests__/**/*.test.ts"],
      setupFiles: ["./src/test-setup.ts"],
    },
    build: {
      outDir: "dist",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("i18next")) return "i18n";
            if (
              id.includes("react-router") ||
              id.includes("/react-dom/") ||
              id.includes("/react/")
            )
              return "react";
          },
        },
      },
    },
  };
});
