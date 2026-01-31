/* eslint-disable no-console */
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DISABLE = process.env.OPEN_OG_DISABLE === "1";
const DEBUG = process.env.OPEN_OG_DEBUG === "1";
const COUNT = Math.max(
  1,
  Number.parseInt(process.env.OPEN_OG_COUNT ?? "10", 10) || 10,
);
const UNIQUE = process.env.OPEN_OG_UNIQUE === "1";
const SOUND_DISABLE = process.env.OPEN_OG_SOUND_DISABLE === "1";

if (DISABLE) process.exit(0);

const assetName =
  process.env.OPEN_OG_FILE ?? "Hacks-to-Increase-Your-Email-Open-Rates.gif";
const assetPath = path.resolve(__dirname, "..", "public", assetName);
if (!fs.existsSync(assetPath)) process.exit(0);

const soundName = process.env.OPEN_OG_SOUND_FILE ?? "avast_sound_fr.mp3";
const soundPath = path.resolve(__dirname, "..", "public", soundName);

const isWSL =
  process.platform === "linux" &&
  os.release().toLowerCase().includes("microsoft");
const platform = isWSL ? "win32" : process.platform;
if (platform === "linux") {
  if (!process.env.DISPLAY && !process.env.WAYLAND_DISPLAY) {
    if (DEBUG) {
      console.warn(
        "[malicious] No DISPLAY/WAYLAND_DISPLAY; cannot open GUI from this process.",
      );
    }
    process.exit(0);
  }
} else {
  // ok
}

try {
  const toWindowsPath = (p) => {
    if (!isWSL) return p;
    try {
      const result = spawnSync("wslpath", ["-w", p], { encoding: "utf8" });
      if (result.status === 0 && result.stdout) return result.stdout.trim();
    } catch {
      // ignore
    }
    return p;
  };

  const spawnSound = (p) => {
    if (SOUND_DISABLE) return;
    if (!fs.existsSync(p)) return;

    const winPath = platform === "win32" ? toWindowsPath(p) : p;
    const isWav = path.extname(p).toLowerCase() === ".wav";

    if (platform === "win32") {
      const psCommand = isWav
        ? `(New-Object Media.SoundPlayer '${winPath.replaceAll("'", "''")}').PlaySync()`
        : `Add-Type -AssemblyName PresentationCore; $p=New-Object System.Windows.Media.MediaPlayer; $p.Open([System.Uri]"${winPath.replaceAll('"', '""')}"); $p.Play(); Start-Sleep -Seconds 5`;

      try {
        const result = spawnSync(
          "powershell.exe",
          ["-NoProfile", "-Sta", "-Command", psCommand],
          { encoding: "utf8" },
        );
        if (DEBUG) {
          if (result.error) {
            console.warn("[malicious] sound spawn error:", result.error.message);
          } else if (result.status && result.status !== 0) {
            console.warn("[malicious] sound exit code:", result.status);
            if (result.stderr) console.warn("[malicious] sound stderr:", result.stderr);
          }
        }
      } catch (err) {
        if (DEBUG) {
          console.warn(
            "[malicious] sound failed:",
            err?.message ?? err,
          );
        }
      }
      return;
    }

    const candidates =
      platform === "linux"
        ? [
            { command: "paplay", args: [p] },
            { command: "aplay", args: [p] },
            { command: "mpg123", args: ["-q", p] },
            { command: "ffplay", args: ["-nodisp", "-autoexit", "-loglevel", "error", p] },
            { command: "cvlc", args: ["--play-and-exit", p] },
            { command: "vlc", args: ["--play-and-exit", p] },
            { command: "xdg-open", args: [p] },
          ]
        : platform === "darwin"
          ? [{ command: "afplay", args: [p] }]
          : [];

    for (const candidate of candidates) {
      try {
        const child = spawn(candidate.command, candidate.args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        if (DEBUG) {
          child.on("error", (err) => {
            console.warn(
              "[malicious] sound spawn error:",
              candidate.command,
              err?.message ?? err,
            );
          });
        }
        return;
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        if (DEBUG) {
          console.warn(
            "[malicious] sound failed:",
            candidate.command,
            err?.message ?? err,
          );
        }
        return;
      }
    }

    if (DEBUG) console.warn("[malicious] No sound player command found.");
  };

  const spawnOpen = (p) => {
    const winPath = platform === "win32" ? toWindowsPath(p) : p;
    const candidates =
      platform === "linux"
        ? [
            { command: "xdg-open", args: [p] },
            { command: "gio", args: ["open", p] },
            { command: "kde-open5", args: [p] },
            { command: "kioclient5", args: ["exec", p] },
          ]
        : platform === "darwin"
          ? [{ command: "open", args: [p] }]
          : platform === "win32"
            ? [
                { command: "explorer.exe", args: [winPath] },
                { command: "cmd.exe", args: ["/c", "start", "", winPath] },
                {
                  command: "powershell.exe",
                  args: [
                    "-NoProfile",
                    "-Command",
                    `Start-Process -FilePath '${winPath.replaceAll("'", "''")}'`,
                  ],
                },
              ]
            : [];

    for (const candidate of candidates) {
      try {
        const child = spawn(candidate.command, candidate.args, {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        if (DEBUG) {
          child.on("error", (err) => {
            console.warn(
              "[malicious] spawn error:",
              candidate.command,
              err?.message ?? err,
            );
          });
          child.on("exit", (code) => {
            if (code && code !== 0) {
              console.warn("[malicious] exit code:", candidate.command, code);
            }
          });
        }
        return;
      } catch (err) {
        if (err?.code === "ENOENT") continue;
        if (DEBUG) {
          console.warn(
            "[malicious] failed:",
            candidate.command,
            err?.message ?? err,
          );
        }
        return;
      }
    }

    if (DEBUG) console.warn("[malicious] No opener command found.");
  };

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  (async () => {
    if (DEBUG) {
      console.log("[malicious] platform:", platform);
      console.log("[malicious] asset:", assetPath);
      console.log("[malicious] count:", COUNT, "unique:", UNIQUE);
      console.log("[malicious] sound:", soundPath, "disabled:", SOUND_DISABLE);
    }

    let tmpDir;
    if (UNIQUE) {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agents-md-og-"));
    }

    try {
      spawnSound(soundPath);
    } catch {
      // ignore
    }

    for (let i = 0; i < COUNT; i += 1) {
      const p = UNIQUE
        ? path.join(tmpDir, `open-${String(i + 1).padStart(2, "0")}-${assetName}`)
        : assetPath;

      if (UNIQUE) fs.copyFileSync(assetPath, p);

      try {
        spawnOpen(p);
      } catch {
        // ignore
      }

      if (i < COUNT - 1) await sleep(120);
    }
  })().catch(() => {});
} catch (err) {
  // Don't block dev server if opener fails.
  console.warn("[malicious] Failed to open:", err?.message ?? err);
}
