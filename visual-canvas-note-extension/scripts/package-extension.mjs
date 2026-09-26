import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distDir = path.join(rootDir, "dist");
const publicDir = path.join(rootDir, "public");
const tmpDir = path.join(rootDir, ".pkg-tmp");
const packageDirName = "persian-notes-extension";
const packageDir = path.join(tmpDir, packageDirName);
const zipName = "persian-notes-extension.zip";
const rootZip = path.join(rootDir, zipName);
const publicZip = path.join(publicDir, zipName);
const distZip = path.join(distDir, zipName);
const tempZip = path.join(tmpDir, zipName);

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

if (!existsSync(path.join(distDir, "index.html"))) {
  console.error("✗ dist/index.html not found. Run `npm run build:app` before packaging.");
  process.exit(1);
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(packageDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

try {
  cpSync(distDir, packageDir, {
    recursive: true,
    filter(source) {
      const relativeToDist = path.relative(distDir, source).replace(/\\/g, "/");
      return relativeToDist !== zipName;
    },
  });

  rmSync(path.join(packageDir, zipName), { force: true });
  rmSync(publicZip, { force: true });

  const zipResult = spawnSync("zip", ["-qr", tempZip, packageDirName], {
    cwd: tmpDir,
    stdio: "inherit",
  });

  if (zipResult.error) throw zipResult.error;
  if (zipResult.status !== 0) {
    throw new Error(`zip exited with code ${zipResult.status ?? "unknown"}`);
  }

  copyFileSync(tempZip, rootZip);
  copyFileSync(tempZip, publicZip);
  copyFileSync(tempZip, distZip);

  console.log(
    `✓ extension package updated → ${zipName} (${formatBytes(statSync(rootZip).size)})`
  );
  console.log(`✓ preview download copy → public/${zipName}`);
  console.log(`✓ downloadable build copy → dist/${zipName}`);
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
