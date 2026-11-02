// Renders marketing/film/index.html to MP4 the way HyperFrames does: seek the paused timeline
// frame by frame (deterministic), show each .clip only inside [start, start+duration), pipe PNGs to ffmpeg.
// Usage: node marketing/film/render.mjs [out.mp4]   (needs Playwright's Chromium and ffmpeg)
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const dir = path.dirname(fileURLToPath(import.meta.url));
const out = process.argv[2] || path.join(dir, "..", "..", "public", "film", "feldbuch-film.mp4");
const FPS = 30;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + path.join(dir, "index.html"));
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => Number(document.getElementById("root").dataset.duration));
const frames = Math.round(duration * FPS);

const ff = spawn("ffmpeg", ["-y", "-loglevel", "error", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-",
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "24", "-preset", "slow", "-movflags", "+faststart", out], { stdio: ["pipe", "inherit", "inherit"] });

for (let f = 0; f < frames; f++) {
  const t = f / FPS;
  await page.evaluate((t) => {
    window.__timelines["feldbuch-film"].seek(t, false);
    for (const c of document.querySelectorAll(".clip")) {
      const s = Number(c.dataset.start), d = Number(c.dataset.duration);
      c.style.visibility = t >= s && t < s + d ? "visible" : "hidden";
    }
  }, t);
  const png = await page.screenshot({ type: "png" });
  if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once("drain", r));
}
ff.stdin.end();
await new Promise((r) => ff.on("close", r));
// Poster: a frame from the invoice scene.
await page.evaluate(() => { window.__timelines["feldbuch-film"].seek(10.2, false);
  for (const c of document.querySelectorAll(".clip")) { const s = +c.dataset.start, d = +c.dataset.duration; c.style.visibility = 10.2 >= s && 10.2 < s + d ? "visible" : "hidden"; } });
await page.screenshot({ path: out.replace(/\.mp4$/, "-poster.jpg"), type: "jpeg", quality: 82 });
await browser.close();
console.log(`rendered ${frames} frames to ${out}`);
