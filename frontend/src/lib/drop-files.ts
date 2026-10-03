/** Files dropped onto a note, including files inside a dropped folder. */

export type DroppedFile = { file: File; path: string };

type Entry = FileSystemEntry;

function entryOf(item: DataTransferItem): Entry | null {
  const withEntry = item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null };
  return withEntry.webkitGetAsEntry?.() ?? null;
}

function readFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

function readDir(entry: FileSystemDirectoryEntry): Promise<Entry[]> {
  const reader = entry.createReader();
  return new Promise((resolve, reject) => {
    const all: Entry[] = [];
    const next = () => {
      reader.readEntries((batch) => {
        if (batch.length === 0) {
          resolve(all);
          return;
        }
        all.push(...batch);
        next();
      }, reject);
    };
    next();
  });
}

async function walk(entry: Entry, prefix: string, out: DroppedFile[]) {
  if (entry.isFile) {
    const file = await readFile(entry as FileSystemFileEntry);
    out.push({ file, path: `${prefix}${file.name}` });
    return;
  }
  if (!entry.isDirectory) return;
  const children = await readDir(entry as FileSystemDirectoryEntry);
  for (const child of children) {
    await walk(child, `${prefix}${entry.name}/`, out);
  }
}

export async function filesFromDrop(data: DataTransfer | null): Promise<DroppedFile[]> {
  if (!data) return [];
  const entries = Array.from(data.items || []).map(entryOf).filter((entry): entry is Entry => Boolean(entry));
  if (entries.length === 0) {
    return Array.from(data.files || []).map((file) => ({ file, path: file.name }));
  }
  const out: DroppedFile[] = [];
  for (const entry of entries) await walk(entry, "", out);
  if (out.length > 0) return out;
  return Array.from(data.files || []).map((file) => ({ file, path: file.name }));
}

export function dragHasFiles(data: DataTransfer | null): boolean {
  if (!data) return false;
  return Array.from(data.types || []).includes("Files");
}
