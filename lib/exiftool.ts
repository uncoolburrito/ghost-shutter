import { execFile } from "child_process";
import fsSync from "fs";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// Candidate paths for exiftool executable
const CANDIDATE_EXIFTOOL_PATHS = [
  process.env.EXIFTOOL_PATH,
  "/opt/homebrew/bin/exiftool",
  "/usr/local/bin/exiftool",
  "/usr/bin/exiftool",
  "exiftool",
].filter(Boolean) as string[];

let resolvedExiftoolPath: string | null = null;

/**
 * Discovers and validates the available ExifTool binary path.
 */
export function getExiftoolPath(): string {
  if (resolvedExiftoolPath) {
    return resolvedExiftoolPath;
  }

  for (const candidate of CANDIDATE_EXIFTOOL_PATHS) {
    try {
      if (candidate.startsWith("/")) {
        if (fsSync.existsSync(candidate)) {
          resolvedExiftoolPath = candidate;
          return resolvedExiftoolPath;
        }
      } else {
        // Simple binary name in PATH
        resolvedExiftoolPath = candidate;
        return resolvedExiftoolPath;
      }
    } catch {
      // Continue search
    }
  }

  // Fallback to "exiftool" in PATH
  resolvedExiftoolPath = "exiftool";
  return resolvedExiftoolPath;
}

/**
 * Checks ExifTool version and availability.
 */
export async function getExiftoolVersion(): Promise<{ available: boolean; version?: string; error?: string }> {
  try {
    const bin = getExiftoolPath();
    const { stdout } = await execFileAsync(bin, ["-ver"], { timeout: 10000 });
    return { available: true, version: stdout.trim() };
  } catch (err: any) {
    return { available: false, error: err.message || "ExifTool not found" };
  }
}

/**
 * Reads all metadata from a file into a JavaScript object via ExifTool JSON output.
 */
export async function readExifMetadata(filePath: string): Promise<Record<string, any>> {
  const bin = getExiftoolPath();
  // Using -j (JSON), -G1 (group names), and -n (numeric) to avoid collisions
  const args = ["-j", "-G1", "-n", filePath];

  try {
    const { stdout } = await execFileAsync(bin, args, { timeout: 15000, maxBuffer: 10 * 1024 * 1024 });
    const parsed = JSON.parse(stdout);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const raw = parsed[0];
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(raw)) {
        result[key] = val;
        const bareKey = key.includes(":") ? key.split(":")[1] : key;
        // Prioritize standard EXIF groups (ExifIFD, IFD0) for bare keys
        if (!(bareKey in result) || key.startsWith("ExifIFD:") || key.startsWith("IFD0:")) {
          result[bareKey] = val;
        }
      }
      return result;
    }
    return {};
  } catch (err: any) {
    throw new Error(`ExifTool read failed: ${err.message || String(err)}`);
  }
}

/**
 * Executes an ExifTool write operation safely using array arguments.
 * NEVER uses shell string interpolation.
 */
export async function writeExifMetadata(
  filePath: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const bin = getExiftoolPath();
  // Ensure -overwrite_original is passed and arguments point to target file
  const fullArgs = ["-overwrite_original", ...args, filePath];

  try {
    const { stdout, stderr } = await execFileAsync(bin, fullArgs, {
      timeout: 30000,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout, stderr };
  } catch (err: any) {
    // If exiftool returned minor warnings with exit code 0/1
    if (err.stdout && err.stdout.includes("1 image files updated")) {
      return { stdout: err.stdout, stderr: err.stderr || "" };
    }
    throw new Error(`ExifTool write failed: ${err.message || err.stderr || String(err)}`);
  }
}
