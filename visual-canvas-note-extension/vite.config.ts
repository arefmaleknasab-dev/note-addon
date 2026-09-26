import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const EXTENSION_ZIP = "persian-notes-extension.zip";

function extensionPackagePreviewPlugin(): Plugin {
  const publicZipPath = path.join(__dirname, "public", EXTENSION_ZIP);
  const downloadablePath = `/${EXTENSION_ZIP}`;
  let dirty = true;
  let buildPromise: Promise<void> | undefined;
  let debounceTimer: NodeJS.Timeout | undefined;

  const toRelative = (file: string) => path.relative(__dirname, file).replace(/\\/g, "/");

  const shouldIgnore = (file: string) => {
    const relative = toRelative(file);

    try {
      if (fs.existsSync(file) && fs.statSync(file).isDirectory()) return true;
    } catch {
      // If the path disappeared between the watcher event and stat, handle it by path below.
    }

    return (
      !relative ||
      relative === "node_modules" ||
      relative.startsWith("node_modules/") ||
      relative === "dist" ||
      relative.startsWith("dist/") ||
      relative === ".git" ||
      relative.startsWith(".git/") ||
      relative === ".pkg-tmp" ||
      relative.startsWith(".pkg-tmp/") ||
      relative === EXTENSION_ZIP ||
      relative === `public/${EXTENSION_ZIP}`
    );
  };

  const buildOnce = (reason: string) => {
    if (buildPromise) return buildPromise;

    dirty = false;
    buildPromise = new Promise<void>((resolve, reject) => {
      const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
      console.log(`\n[extension-package] ${reason}; updating ${EXTENSION_ZIP}...`);
      const child = spawn(npmCommand, ["run", "build"], {
        cwd: __dirname,
        env: { ...process.env, NODE_ENV: "production" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      child.stdout.on("data", (chunk) => process.stdout.write(chunk));
      child.stderr.on("data", (chunk) => process.stderr.write(chunk));
      child.on("error", (error) => {
        dirty = true;
        reject(error);
      });
      child.on("close", (code) => {
        if (code === 0) {
          console.log(`[extension-package] ${EXTENSION_ZIP} is ready for download.`);
          resolve();
        } else {
          dirty = true;
          reject(new Error(`extension package build failed with exit code ${code}`));
        }
      });
    }).finally(() => {
      buildPromise = undefined;
    });

    return buildPromise;
  };

  const ensureFreshPackage = async (reason: string) => {
    if (buildPromise) await buildPromise;

    let attempts = 0;
    while ((dirty || !fs.existsSync(publicZipPath)) && attempts < 5) {
      await buildOnce(reason);
      reason = "changes detected while packaging";
      attempts += 1;
    }

    if (dirty || !fs.existsSync(publicZipPath)) {
      throw new Error(`could not produce ${EXTENSION_ZIP}`);
    }
  };

  const schedulePackage = (reason: string) => {
    dirty = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      ensureFreshPackage(reason).catch((error) => {
        console.error("[extension-package] automatic package update failed:", error);
      });
    }, 900);
  };

  return {
    name: "extension-package-preview",
    apply: "serve",
    configureServer(server) {
      schedulePackage("dev server started");

      server.watcher.on("all", (event, file) => {
        if (!["add", "change", "unlink"].includes(event)) return;
        if (shouldIgnore(file)) return;
        schedulePackage(`${event} ${toRelative(file)}`);
      });

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        const url = new URL(req.url ?? "/", "http://localhost");
        if (url.pathname !== downloadablePath) return next();

        try {
          await ensureFreshPackage("download requested");
          const stat = fs.statSync(publicZipPath);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/zip");
          res.setHeader("Content-Disposition", `attachment; filename="${EXTENSION_ZIP}"`);
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          res.setHeader("Content-Length", String(stat.size));

          if (req.method === "HEAD") {
            res.end();
            return;
          }

          fs.createReadStream(publicZipPath).pipe(res);
        } catch (error) {
          console.error("[extension-package] download failed:", error);
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Could not build the latest Chrome extension package. Check the dev server logs.");
        }
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    tailwindcss(),
    viteSingleFile(),
    command === "serve" ? extensionPackagePreviewPlugin() : undefined,
  ].filter(Boolean),
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    watch: {
      ignored: [
        "**/.pkg-tmp",
        "**/.pkg-tmp/**",
        "**/dist",
        "**/dist/**",
        `**/${EXTENSION_ZIP}`,
        `**/public/${EXTENSION_ZIP}`,
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
}));
