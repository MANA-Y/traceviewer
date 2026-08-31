import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const BASE = process.env.TRACEVIEWER_URL ?? 'http://localhost:5173';
const TRACE = '/var/traces/presentations.example.json';
const OUT = 'docs/images';
const VIEWPORT = { width: 1440, height: 900 };

function talkUrl(extra = '') {
  const params = new URLSearchParams({
    trace: TRACE,
    animate: '1',
  });
  const suffix = extra.startsWith('&') ? extra.slice(1) : extra;
  if (suffix) {
    new URLSearchParams(suffix).forEach((value, key) => params.set(key, value));
  }
  return `${BASE}/?${params}`;
}

async function waitForDeck(page) {
  await page.locator('.presentation-progress').waitFor({ state: 'visible' });
  await page.waitForTimeout(400);
}

async function lastPresentationStep(page) {
  await page.goto(talkUrl('step=0'));
  await waitForDeck(page);
  const label = await page.locator('.presentation-progress').innerText();
  const total = Number((label.match(/\/\s*(\d+)/) ?? [0, 1])[1]);
  return Math.max(0, total - 1);
}

async function openPage(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'light',
  });
  await context.addInitScript(() => {
    localStorage.setItem('traceviewer-theme', 'light');
    localStorage.setItem('traceviewer-presenter-collapsed', '0');
    localStorage.setItem('traceviewer-presentation-settings', JSON.stringify({
      scrollToSection: false,
    }));
  });
  return { context, page: await context.newPage() };
}

async function captureScreenshots(browser) {
  const { context, page } = await openPage(browser);
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Open a presentation' }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT, 'landing.png') });

  const lastStep = await lastPresentationStep(page);
  await page.goto(talkUrl(`step=${lastStep}`));
  await waitForDeck(page);
  await page.screenshot({ path: join(OUT, 'audience.png') });

  await page.goto(talkUrl('step=3&presenter=1'));
  await waitForDeck(page);
  await page.getByLabel('Presenter view').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'presenter.png') });

  await page.goto(talkUrl('step=4&view=source'));
  await waitForDeck(page);
  await page.waitForFunction(() => {
    const line = document.querySelector('.source-mode .line');
    return Boolean(line && line.innerText.trim().length > 0);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: join(OUT, 'source.png') });
  await context.close();
}

async function capturePlayback(browser) {
  const framesDir = join(OUT, '.frames');
  mkdirSync(framesDir, { recursive: true });
  const { context, page } = await openPage(browser);
  await page.goto(talkUrl('step=0'));
  await waitForDeck(page);
  await page.getByRole('heading', { name: 'TraceViewer' }).waitFor();
  const steps = await page.locator('.presentation-progress').innerText();
  const total = Number((steps.match(/\/\s*(\d+)/) ?? [0, 1])[1]);
  for (let index = 0; index < total; index += 1) {
    if (index > 0) {
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(250);
    }
    await page.screenshot({ path: join(framesDir, `frame-${String(index).padStart(2, '0')}.png`) });
  }
  await context.close();
  return framesDir;
}

function convertFrames(framesDir) {
  const mp4 = join(OUT, 'playback.mp4');
  const gif = join(OUT, 'playback.gif');
  const pattern = join(framesDir, 'frame-%02d.png');
  const mp4Result = spawnSync('ffmpeg', [
    '-y', '-framerate', '0.55', '-start_number', '0', '-i', pattern,
    '-vf', 'scale=960:-2:flags=lanczos',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
    mp4,
  ], { stdio: 'inherit' });
  const gifResult = spawnSync('ffmpeg', [
    '-y', '-framerate', '0.55', '-start_number', '0', '-i', pattern,
    '-vf', 'scale=800:-2:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
    gif,
  ], { stdio: 'inherit' });
  rmSync(framesDir, { recursive: true, force: true });
  if (mp4Result.status !== 0 || gifResult.status !== 0) {
    throw new Error('ffmpeg failed to encode playback media');
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  await captureScreenshots(browser);
  const framesDir = await capturePlayback(browser);
  await browser.close();
  convertFrames(framesDir);
  console.log(`Wrote screenshots and playback media under ${OUT}/`);
}

await main();
