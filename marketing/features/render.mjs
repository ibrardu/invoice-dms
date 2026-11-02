// Renders each feature loop in marketing/features/index.html to public/features/<id>.mp4 (+ <id>.jpg poster),
// seeking the paused timeline frame by frame like HyperFrames. Usage: node marketing/features/render.mjs [id...]
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)("playwright");

const dir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(dir, "..", "..", "public", "features");
mkdirSync(outDir, { recursive: true });
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ["receipts", "vat", "elster", "bank", "lock", "numbers"];
const FPS = 30;
const withTimeout = (pr, ms, what) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${what}`)), ms))]);

for (const id of ids) {
  const browser = await chromium.launch();   // fresh browser per clip keeps one stuck page from blocking the rest
  const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
  await page.goto("file://" + path.join(dir, "index.html") + "?f=" + id);
  await page.evaluate(() => document.fonts.ready);
  const duration = await page.evaluate((id) => Number(document.getElementById(id).dataset.duration), id);
  // Poster first, from a fresh timeline (seeking back after the loop's reset would miss counter updates).
  await page.evaluate(([id, t]) => { window.__timelines[id].seek(t, false); }, [id, duration * 0.55]);
  await page.screenshot({ path: path.join(outDir, `${id}.jpg`), type: "jpeg", quality: 80 });
  await page.reload(); await page.evaluate(() => document.fonts.ready);
  const out = path.join(outDir, `${id}.mp4`);
  const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "27", "-preset", "slow", "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
  const frames = Math.round(duration * FPS);
  for (let f = 0; f < frames; f++) {
    await withTimeout(page.evaluate(([id, t]) => { window.__timelines[id].seek(t, false); }, [id, f / FPS]), 10000, `${id} seek ${f}`);
    const png = await withTimeout(page.screenshot({ type: "png" }), 15000, `${id} shot ${f}`);
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  console.log(`${id}: ${frames} frames`);
}
