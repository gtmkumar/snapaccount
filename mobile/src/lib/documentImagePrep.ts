/**
 * Document capture image preparation — DG-MOBUX-06 / offline-first-photo-capture.md §4.
 *
 * Two jobs before a captured/picked photo enters the upload queue:
 *  1. EXIF-strip + downscale: re-encode the image to a fresh JPEG at a bounded
 *     longest-edge with moderate compression. Re-encoding via expo-image-manipulator
 *     drops all EXIF metadata (GPS / device / timestamp) and bakes in the
 *     orientation — a privacy + payload-size win (network-aware-ux.md §4.2).
 *  2. Stage to durable storage: copy the processed JPEG into
 *     {documentDirectory}/queue/{id}.jpg so the queue item survives the original
 *     camera-cache URI being evicted by the OS before a (possibly offline) upload.
 *
 * Everything degrades gracefully: on any failure we fall back to the original URI
 * so a capture is never lost — the queue still uploads the raw file.
 */

import * as ImageManipulator from 'expo-image-manipulator';
// The legacy FileSystem surface (documentDirectory / makeDirectoryAsync / copyAsync /
// getInfoAsync) is the simplest fit for staging a single file; the new File/Directory
// API is heavier and not needed here.
import * as FileSystem from 'expo-file-system/legacy';

/** Sub-directory under documentDirectory where staged queue images live. */
export const QUEUE_DIR_NAME = 'queue';

/** Longest-edge cap (px) for staged document images. Bills/receipts stay legible. */
const MAX_DIMENSION = 1600;
/** JPEG quality (0-1). 0.6 ≈ aggressive-but-readable per network-aware-ux §4.2. */
const JPEG_QUALITY = 0.6;

export interface PreparedImage {
  /** Durable file:// URI of the staged, EXIF-stripped JPEG (or the original on fallback). */
  uri: string;
  /** Size in bytes of the staged file, when resolvable (manifest `sizeBytes`). */
  sizeBytes?: number;
  /** True when EXIF-strip + staging succeeded; false when we fell back to the raw URI. */
  processed: boolean;
}

/** Absolute path of the queue staging directory, or null when no documentDirectory. */
function queueDir(): string | null {
  const base = FileSystem.documentDirectory;
  if (!base) return null;
  return `${base}${QUEUE_DIR_NAME}`;
}

/** Ensure the queue staging directory exists (idempotent). */
async function ensureQueueDir(): Promise<string | null> {
  const dir = queueDir();
  if (!dir) return null;
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }
    return dir;
  } catch {
    return null;
  }
}

/**
 * EXIF-strip + downscale `sourceUri`, stage it as queue/{id}.jpg, and return the
 * staged URI + byte size. Never throws — falls back to the original URI on error.
 */
export async function prepareDocumentImage(
  sourceUri: string,
  id: string,
): Promise<PreparedImage> {
  // 1. Re-encode (strips EXIF) + downscale longest edge.
  let processedUri = sourceUri;
  let didProcess = false;
  try {
    const result = await ImageManipulator.manipulateAsync(
      sourceUri,
      [{ resize: { width: MAX_DIMENSION } }],
      { compress: JPEG_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    if (result?.uri) {
      processedUri = result.uri;
      didProcess = true;
    }
  } catch {
    // Manipulator unavailable / unsupported source — upload the raw file instead.
    return { uri: sourceUri, processed: false };
  }

  // 2. Stage into durable storage so the OS can't evict the cache file mid-queue.
  const dir = await ensureQueueDir();
  let stagedUri = processedUri;
  if (dir) {
    const target = `${dir}/${id}.jpg`;
    try {
      await FileSystem.copyAsync({ from: processedUri, to: target });
      stagedUri = target;
    } catch {
      // Copy failed — keep the (already EXIF-stripped) processed URI.
      stagedUri = processedUri;
    }
  }

  // 3. Resolve size for the manifest (best-effort).
  let sizeBytes: number | undefined;
  try {
    const info = await FileSystem.getInfoAsync(stagedUri);
    if (info.exists && typeof info.size === 'number') {
      sizeBytes = info.size;
    }
  } catch {
    // size is optional in the manifest
  }

  return { uri: stagedUri, sizeBytes, processed: didProcess };
}

/**
 * Best-effort cleanup of a staged queue file once its document is uploaded/removed.
 * Only deletes inside the queue staging dir (never the original camera/gallery URI).
 */
export async function cleanupStagedImage(uri: string | undefined): Promise<void> {
  if (!uri) return;
  const dir = queueDir();
  if (!dir || !uri.startsWith(dir)) return;
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // ignore — staged files are also reclaimed when the app's documentDirectory is cleared
  }
}
