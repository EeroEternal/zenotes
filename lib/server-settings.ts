import os from "os";
import path from "path";
import { DEFAULT_SETTINGS } from "@/lib/settings";

export function getServerRootDir(): string {
  // Priority: env var -> ~/Documents/Mynotes (fallback)
  const env = process.env.MYNOTES_ROOT_DIR;
  if (env && env.trim().length > 0) return env;
  const home = os.homedir();
  return path.join(home, "Documents", DEFAULT_SETTINGS.storage.noteFolderName || "Mynotes");
}

export function getServerImagesDir(): string {
  const root = getServerRootDir();
  const folder = DEFAULT_SETTINGS.images.imageFolderName || "images";
  return path.join(root, folder);
}

export function getFsBaseUrl(): string {
  // The URL path clients will use to fetch images stored under the FS root
  return "/fs-images";
}

