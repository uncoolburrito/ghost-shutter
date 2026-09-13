import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

const BASE_TEMP_DIR = path.join(os.tmpdir(), "ghostshutter");

/**
 * Initializes the root temporary directory if it doesn't already exist.
 */
export async function ensureTempBaseDir(): Promise<string> {
  await fs.mkdir(BASE_TEMP_DIR, { recursive: true });
  return BASE_TEMP_DIR;
}

/**
 * Creates an isolated, unique temporary workspace directory for a processing job.
 */
export async function createJobDirectory(): Promise<{ jobId: string; jobDir: string }> {
  await ensureTempBaseDir();
  const jobId = crypto.randomBytes(16).toString("hex");
  const jobDir = path.join(BASE_TEMP_DIR, jobId);
  await fs.mkdir(jobDir, { recursive: true });
  return { jobId, jobDir };
}

/**
 * Deletes a job directory and all its contents immediately.
 */
export async function cleanupJobDirectory(jobDir: string): Promise<void> {
  try {
    if (jobDir.startsWith(BASE_TEMP_DIR)) {
      await fs.rm(jobDir, { recursive: true, force: true });
    }
  } catch (err) {
    // Non-fatal, suppress or log without sensitive info
  }
}

/**
 * Cleans up orphaned job directories older than maxAgeMs (default 15 minutes).
 */
export async function sweepStaleJobDirectories(maxAgeMs: number = 15 * 60 * 1000): Promise<number> {
  let cleanedCount = 0;
  try {
    if (!fsSync.existsSync(BASE_TEMP_DIR)) return 0;
    const entries = await fs.readdir(BASE_TEMP_DIR, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(BASE_TEMP_DIR, entry.name);
        try {
          const stat = await fs.stat(fullPath);
          if (now - stat.mtimeMs > maxAgeMs) {
            await fs.rm(fullPath, { recursive: true, force: true });
            cleanedCount++;
          }
        } catch {
          // ignore individual entry error
        }
      }
    }
  } catch {
    // ignore
  }
  return cleanedCount;
}
