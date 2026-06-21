import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import os from "os";
import path from "path";
const execFileAsync = promisify(execFile);

export async function getAudioDuration(input: string | Buffer): Promise<number> {
  try {
    if (Buffer.isBuffer(input)) {
      try {
        return await getDurationFromBuffer(input);
      } catch {
        // mkv/avi fallback — write temp file so ffprobe can seek
      
        return await getDurationFromTempFile(input);
      }
    }

    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      input,
    ]);
    const info = JSON.parse(stdout);
    return parseFloat(info.format.duration);
        } catch (err) {
        console.log(err)
    return 0;
  }
}
async function getDurationFromBuffer(buffer: Buffer): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      "ffprobe",
      [
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        `${buffer}`,
        "-",
      ],
      (err, stdout) => {
        if (err) return reject(err);
        try {
          const info = JSON.parse(stdout);
          const duration = parseFloat(info.format?.duration);

          if (!duration || isNaN(duration) || duration <= 0) {
            return reject(new Error("duration unavailable from stream"));
          }

          resolve(duration);
        } catch {
          reject(new Error("ffprobe parse failed"));
        }
      }
    );

    // Ignore EPIPE — ffprobe closes stdin early once it has enough header data
    proc.stdin!.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code !== "EPIPE") reject(err);
    });

    proc.stdin!.write(buffer);
    proc.stdin!.end();
  });
}


async function getDurationFromTempFile(buffer: Buffer): Promise<number> {
  const tmp = path.join(os.tmpdir(), `ffprobe-${Date.now()}`);
  try {
    await fs.writeFile(tmp, buffer);
    const { stdout } = await execFileAsync("ffprobe", [
      "-v", "quiet",
      "-print_format", "json",
      "-show_format",
      tmp,
    ]);
    const info = JSON.parse(stdout);
    return parseFloat(info.format.duration);
  } finally {
    await fs.unlink(tmp).catch(() => {});  // always clean up
  }
}
