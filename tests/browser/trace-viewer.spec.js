import { expect, test } from '@playwright/test';
import fixture from './fixtures/presentation.json' with { type: 'json' };
import { createPerformanceTrace } from '../../scripts/performance-fixture.mjs';

const traceUrl = '/browser-fixture.json';

test.beforeEach(async ({ page }) => {
  const consoleErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  await page.route(`**${traceUrl}`, (route) => route.fulfill({ json: fixture }));
  await page.goto(`/?trace=${encodeURIComponent(traceUrl)}&step=0&animate=1`);
  await expect(page.getByRole('heading', { name: 'Browser fixture' })).toBeVisible();
  test.info().consoleErrors = consoleErrors;
});

test.afterEach(async () => {
  expect(test.info().consoleErrors, 'browser console errors').toEqual([]);
});

test('loads a static trace and navigates with ArrowRight and L', async ({ page }) => {
  await expect(page).toHaveURL(/step=0/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=1/);
  await page.keyboard.press('l');
  await expect(page).toHaveURL(/step=2/);
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeVisible();
});

test('presentation playback skips execution loops while source playback stays exact', async ({ page }) => {
  const sparseTraceUrl = '/sparse-browser-fixture.json';
  const sparseTrace = {
    formatVersion: 2,
    files: { 'loop.py': 'text("First")\nfor item in items:\n    measure(item)\ntext("Last")\n' },
    frames: [1, 2, 3, 2, 4].map((line_number) => ({
      path: 'loop.py', line_number, function_name: 'main', invocation_id: 1,
    })),
    renderings: [
      [],
      [{ type: 'markdown', data: 'First' }],
      [{ type: 'markdown', data: 'Last' }],
    ],
    outputs: [''],
    presentationSteps: [0, 1, 2, 4],
    steps: [
      [[0], 1, 0, 0, {}],
      [[1], 0, 0, 0, {}],
      [[2], 0, 0, 0, {}],
      [[3], 0, 0, 0, {}],
      [[4], 2, 0, 0, {}],
    ],
  };
  await page.route(`**${sparseTraceUrl}`, (route) => route.fulfill({ json: sparseTrace }));

  await page.goto(`/?trace=${encodeURIComponent(sparseTraceUrl)}&step=0`);
  // Keys pressed before the deck mounts go nowhere, so wait for the progress dock
  await expect(page.locator('.presentation-progress')).toContainText('1 / 4');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=1/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=2/);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=4/);
  await expect(page.locator('.presentation-progress')).toContainText('4 / 4');

  await page.goto(`/?trace=${encodeURIComponent(sparseTraceUrl)}&step=3`);
  await expect(page).toHaveURL(/step=2/);
  await expect(page.locator('.presentation-progress')).toContainText('3 / 4');
  await expect(page.locator('.current-line')).toContainText('measure(item)');

  await page.goto(`/?trace=${encodeURIComponent(sparseTraceUrl)}&step=0&view=source`);
  await expect(page.locator('.presentation-progress')).toContainText('1 / 5');
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=1/);
  await expect(page.locator('.presentation-progress')).toContainText('2 / 5');
  await page.goto(`/?trace=${encodeURIComponent(sparseTraceUrl)}&step=3&view=source`);
  await page.getByRole('button', { name: 'Toggle source view' }).click();
  await expect(page).toHaveURL(/step=2/);
  await expect(page).not.toHaveURL(/view=source/);
  await expect(page.locator('.current-line')).toContainText('measure(item)');
});

test('shows a loading lobby before the snapshot arrives', async ({ page }) => {
  const slowUrl = '/slow-browser-fixture.json';
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route(`**${slowUrl}`, async (route) => {
    await gate;
    await route.fulfill({ json: fixture });
  });

  await page.goto(`/?trace=${encodeURIComponent(slowUrl)}&animate=1`);
  await expect(page.getByRole('heading', { name: 'Loading presentation' })).toBeVisible();
  await expect(page.locator('.loading-screen')).toBeVisible();
  release();
  await expect(page.getByRole('heading', { name: 'Browser fixture' })).toBeVisible();
});

test('switches and persists the color theme', async ({ page }) => {
  await page.getByRole('button', { name: 'Presentation settings' }).click();
  await page.getByRole('tab', { name: 'Interface' }).click();
  const theme = page.getByRole('combobox', { name: 'Color theme' });
  await theme.selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');

  await page.reload();
  await page.getByRole('button', { name: 'Presentation settings' }).click();
  await page.getByRole('tab', { name: 'Interface' }).click();
  await expect(theme).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await theme.selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('persists presentation text size, line numbers, and section scroll', async ({ page }) => {
  await page.keyboard.press('s');
  const dialog = page.getByRole('dialog', { name: 'Presentation settings' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('tab', { name: 'Interface' }).click();
  await dialog.getByRole('combobox', { name: 'Presentation text size' }).selectOption('1.15');
  await dialog.getByRole('combobox', { name: 'Presentation font' }).selectOption('serif');
  await dialog.getByRole('combobox', { name: 'Code font' }).selectOption('monaco');
  await dialog.getByRole('combobox', { name: 'Step highlight color' }).selectOption('green');
  await dialog.getByRole('checkbox', { name: 'Line numbers' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Pin headings' }).uncheck();
  await dialog.getByRole('tab', { name: 'Presentation' }).click();
  await dialog.getByRole('checkbox', { name: 'Scroll to section start' }).uncheck();
  await expect.poll(() => page.locator('html').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--presentation-scale').trim()
  ))).toBe('1.15');
  await expect(page.locator('html')).toHaveAttribute('data-font-family', 'serif');
  await expect(page.locator('html')).toHaveAttribute('data-code-font', 'monaco');
  await expect(page.locator('html')).toHaveAttribute('data-line-numbers', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-step-highlight', 'green');
  await expect(page.locator('html')).toHaveAttribute('data-pin-headings', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-scroll-to-section', 'off');
  await expect(page.locator('.presentation-mode .line-number').first()).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.reload();
  await expect.poll(() => page.locator('html').evaluate((element) => (
    getComputedStyle(element).getPropertyValue('--presentation-scale').trim()
  ))).toBe('1.15');
  await expect(page.locator('html')).toHaveAttribute('data-font-family', 'serif');
  await expect(page.locator('html')).toHaveAttribute('data-code-font', 'monaco');
  await expect(page.locator('html')).toHaveAttribute('data-line-numbers', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-step-highlight', 'green');
  await expect(page.locator('html')).toHaveAttribute('data-pin-headings', 'off');
  await expect(page.locator('html')).toHaveAttribute('data-scroll-to-section', 'off');
  await expect(page.locator('.presentation-mode .line-number').first()).toBeHidden();
});

test('exports the full presentation through the print PDF path', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeHidden();

  await page.evaluate(() => {
    window.__printCalls = 0;
    window.print = () => { window.__printCalls += 1; };
  });

  await page.getByRole('button', { name: 'Export PDF' }).click();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(1);
  await expect(page.locator('html')).toHaveClass(/is-print-export/);
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeAttached();

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeVisible();
  await expect(page.locator('.presentation-progress')).toBeHidden();
  await expect(page.locator('.print-speaker-notes')).toContainText('Welcome the audience and introduce the fixture.');
  expect(await page.locator('.presentation-section').nth(1).evaluate((element) => (
    getComputedStyle(element).breakBefore
  ))).not.toBe('page');

  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('html')).not.toHaveClass(/is-print-export/);

  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Presentation settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Presentation settings' });
  await dialog.getByRole('button', { name: 'Save presentation as PDF' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__printCalls)).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await expect(page.locator('html')).not.toHaveClass(/is-print-export/);
});

test('switches the PDF export between book and slide styles', async ({ page }) => {
  await expect(page.locator('html')).toHaveAttribute('data-pdf-style', 'book');

  const breakBefore = () => page.locator('.presentation-section').nth(1).evaluate((element) => (
    getComputedStyle(element).breakBefore
  ));
  const headingAlign = () => page.locator('.presentation-section .line-content').first().evaluate(
    (element) => getComputedStyle(element).textAlign,
  );

  await page.getByRole('button', { name: 'Presentation settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Presentation settings' });
  await dialog.getByRole('tab', { name: 'Interface' }).click();
  await dialog.getByLabel('Center headings').check();
  await page.keyboard.press('Escape');

  await page.emulateMedia({ media: 'print' });
  expect(await breakBefore()).not.toBe('page');
  expect(await headingAlign()).toBe('left');

  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Presentation settings' }).click();
  await dialog.getByLabel('PDF export style').selectOption('slides');
  await page.keyboard.press('Escape');
  await expect(page.locator('html')).toHaveAttribute('data-pdf-style', 'slides');

  await page.emulateMedia({ media: 'print' });
  expect(await breakBefore()).toBe('page');
  expect(await headingAlign()).toBe('center');

  await page.emulateMedia({ media: 'screen' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-pdf-style', 'slides');
});

test('virtualizes a large source and follows the active line', async ({ page }) => {
  const largeTraceUrl = 'large-browser-fixture.json';
  const largeTrace = createPerformanceTrace(1_000, 1_000);
  await page.route(`**/${largeTraceUrl}`, (route) => route.fulfill({ json: largeTrace }));
  await page.goto(`/?trace=${encodeURIComponent(largeTraceUrl)}&step=899&view=source`);

  const viewport = page.locator('.virtual-source-viewport');
  await expect(viewport).toBeVisible();
  await expect(page.locator('.current-line .line-number')).toContainText('900');
  expect(await page.locator('.source-mode .line').count()).toBeLessThan(100);
  await expect(viewport).toHaveAttribute('data-rendered-lines', /[1-9][0-9]?/);
});

test('notes view is a remote control without slides', async ({ page }) => {
  await page.goto(`/?trace=${encodeURIComponent(traceUrl)}&step=0&view=notes`);
  await expect(page.getByRole('main', { name: 'Presenter notes and control' })).toBeVisible();
  await expect(page.getByText('Welcome the audience and introduce the fixture.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Browser fixture' })).toHaveCount(0);
  await page.keyboard.press('ArrowRight');
  await expect(page).toHaveURL(/step=1/);
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page).toHaveURL(/step=2/);
  await expect(page.getByRole('main', { name: 'Presenter notes and control' })).toContainText('Measurements');
});

test('toggles presenter notes and source view', async ({ page }) => {
  await page.keyboard.press('p');
  await expect(page).toHaveURL(/presenter=1/);
  const presenter = page.getByRole('complementary', { name: 'Presenter view' });
  await expect(presenter).toContainText('Welcome the audience');
  await page.keyboard.press('r');
  await expect(page).toHaveURL(/view=source/);
  await expect(page.locator('.source-mode .header-title')).toContainText('browser_fixture.py');
});

async function openInspector(presenter) {
  const inspector = presenter.locator('.presenter-inspector-details');
  if (!await inspector.getAttribute('open')) {
    await presenter.locator('.presenter-inspector-summary').click();
  }
}

test('presenter rehearsal timer and inspector expose step diagnostics', async ({ page }) => {
  await page.keyboard.press('p');
  const presenter = page.getByRole('complementary', { name: 'Presenter view' });
  await presenter.getByRole('button', { name: 'Start' }).click();
  await expect(presenter.getByRole('button', { name: 'Pause' })).toBeVisible();
  await openInspector(presenter);
  await expect(presenter.getByRole('tabpanel')).toContainText('audience');
  await presenter.getByRole('tab', { name: 'Stack' }).click();
  await expect(presenter.getByRole('tabpanel')).toContainText('main');
  await presenter.getByRole('tab', { name: 'stdout' }).click();
  await expect(presenter.getByRole('tabpanel')).toContainText('fixture ready');
  await presenter.getByRole('tab', { name: 'stderr' }).click();
  await expect(presenter.getByRole('tabpanel')).toContainText('sample warning');
});

test('inspector searches, copies, and accumulates streams', async ({ page }) => {
  await page.keyboard.press('p');
  const presenter = page.getByRole('complementary', { name: 'Presenter view' });
  await openInspector(presenter);
  const search = presenter.getByRole('searchbox', { name: 'Search inspector' });
  await search.fill('audience');
  await expect(presenter.getByRole('tabpanel')).toContainText('engineers');
  await expect(presenter.getByRole('tabpanel')).not.toContainText('demo_count');
  await presenter.getByRole('button', { name: 'Copy' }).click();
  await expect(presenter.getByRole('status')).toHaveText('Copied');

  await search.fill('');
  await page.getByRole('slider', { name: 'Presentation step' }).fill('1');
  await presenter.getByRole('tab', { name: 'stdout' }).click();
  await expect(presenter.getByRole('tabpanel')).toContainText('second step');
  await presenter.getByRole('button', { name: 'Accumulated' }).click();
  await expect(presenter.getByRole('tabpanel')).toContainText('fixture ready');
  await expect(presenter.getByRole('tabpanel')).toContainText('second step');
});

test('presenter panel can be hidden and shown again', async ({ page }) => {
  await page.keyboard.press('p');
  const presenter = page.getByRole('complementary', { name: 'Presenter view' });
  await presenter.getByRole('button', { name: 'Hide' }).click();
  await expect(page.getByRole('button', { name: 'Show presenter notes' })).toBeVisible();
  await page.getByRole('button', { name: 'Show presenter notes' }).click();
  await expect(presenter.getByRole('button', { name: 'Hide' })).toBeVisible();
});

test('seeks with progress range and section marker', async ({ page }, testInfo) => {
  const progress = page.getByRole('slider', { name: 'Presentation step' });
  await progress.fill('4');
  await expect(page).toHaveURL(/step=4/);
  await expect(progress).toHaveValue('4');
  const marker = page.getByRole('button', { name: 'Go to section: Measurements' });
  if (testInfo.project.name === 'mobile') {
    await marker.focus();
    await marker.press('Enter');
  } else {
    await marker.click();
  }
  await expect(page).toHaveURL(/step=2/);
  await expect(progress).toHaveValue('2');
});

test('presentation visual baseline', async ({ page }) => {
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.presentation-progress')).toContainText('2 / 5');
  await expect(page).toHaveScreenshot('presentation.png', { fullPage: true });
});

test('presenter visual baseline', async ({ page }) => {
  await page.keyboard.press('p');
  await expect(page.getByRole('complementary', { name: 'Presenter view' })).toBeVisible();
  await expect(page).toHaveScreenshot('presenter.png', { fullPage: true });
});

test('renders bundled MathJax under the content security policy', async ({ page }) => {
  const mathTraceUrl = '/math-fixture.json';
  const failedFonts = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.woff') && !response.ok()) {
      failedFonts.push(`${response.status()} ${response.url()}`);
    }
  });
  const mathTrace = {
    formatVersion: 2,
    files: { 'math.py': 'text("$x^2 + \\\\frac{1}{2} + \\\\sqrt{\\\\alpha}$")\n' },
    frames: [{ path: 'math.py', line_number: 1, function_name: 'main', invocation_id: 1 }],
    renderings: [[{ type: 'markdown', data: '$x^2 + \\frac{1}{2} + \\sqrt{\\alpha}$' }]],
    outputs: [''],
    steps: [[[0], 0, 0, 0, {}]],
  };
  await page.route(`**${mathTraceUrl}`, (route) => route.fulfill({ json: mathTrace }));
  await page.goto(`/?trace=${encodeURIComponent(mathTraceUrl)}&step=0`);

  await expect(page.locator('mjx-container')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(failedFonts).toEqual([]);
});

test('zooms image regions and opens overlay explanations', async ({ page }) => {
  const imageTraceUrl = '/annotated-image-fixture.json';
  const imageTrace = {
    formatVersion: 2,
    files: { 'image.py': 'image("chart.png")\n' },
    frames: [{ path: 'image.py', line_number: 1, function_name: 'main', invocation_id: 1 }],
    renderings: [[{
      type: 'image',
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      alt: 'Composite chart',
      style: { width: 800 },
      focus: { x: 0, y: 0, width: 50, height: 50 },
      overlays: [{
        x: 25, y: 25, title: 'Queue growth', text: 'The queue starts growing here.',
        focus: { x: 15, y: 10, width: 20, height: 25 },
      }],
    }]],
    outputs: [''],
    steps: [[[0], 0, 0, 0, {}]],
  };

  await page.route(`**${imageTraceUrl}`, (route) => route.fulfill({ json: imageTrace }));
  await page.goto(`/?trace=${encodeURIComponent(imageTraceUrl)}&step=0`);

  const stage = page.locator('.annotated-image-stage');
  const frame = page.locator('.annotated-image');
  await expect(page.getByRole('img', { name: 'Composite chart' })).toBeVisible();
  await expect(frame).toHaveClass(/is-focused/);
  await expect.poll(async () => stage.evaluate((element) => element.style.width)).toBe('200%');

  const marker = page.getByRole('button', { name: 'Queue growth' });
  await marker.click();
  await expect(marker).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('tooltip')).toContainText('The queue starts growing here.');
  await expect.poll(async () => stage.evaluate((element) => element.style.width)).toBe('200%');
  await expect(page.locator('.image-focus-highlight')).toHaveCount(0);

  await page.getByRole('button', { name: 'Overview' }).click();
  await expect(frame).not.toHaveClass(/is-focused/);
  await expect(page.getByRole('button', { name: 'Overview' })).toHaveCount(0);

  await page.emulateMedia({ media: 'print' });
  await expect(frame).not.toHaveClass(/is-focused/);
  const legend = page.locator('.print-callout-legend');
  await expect(legend).toContainText('Queue growth');
  await expect(legend).toContainText('The queue starts growing here.');
  await expect(page.locator('.print-figure-caption')).toContainText('Composite chart');
  await expect(page.getByRole('tooltip')).toBeHidden();
  await page.emulateMedia({ media: 'screen' });
  await expect(legend).toBeHidden();
});

test('pins a newly opened section heading to the top of the viewport', async ({ page }) => {
  const sectionTraceUrl = '/section-pin-fixture.json';
  const padCount = 16;
  const sectionTrace = {
    formatVersion: 2,
    files: {
      'talk.py': [
        'section("Opening", "Fill the first screen")',
        ...Array.from({ length: padCount }, (_, index) => `text("Pad ${index}")`),
        'section("Next topic", "Must pin to the top")',
        'text("After the heading")',
      ].join('\n'),
    },
    frames: Array.from({ length: padCount + 3 }, (_, index) => ({
      path: 'talk.py', line_number: index + 1, function_name: 'main', invocation_id: 1,
    })),
    renderings: [
      [{ type: 'section', data: JSON.stringify({ title: 'Opening', subtitle: 'Fill the first screen' }) }],
      ...Array.from({ length: padCount }, (_, index) => [{ type: 'markdown', data: `Pad ${index}` }]),
      [{ type: 'section', data: JSON.stringify({ title: 'Next topic', subtitle: 'Must pin to the top' }) }],
      [{ type: 'markdown', data: 'After the heading' }],
    ],
    outputs: Array.from({ length: padCount + 3 }, () => ''),
    steps: Array.from({ length: padCount + 3 }, (_, index) => [[index], index, index, 0, {}]),
  };

  await page.route(`**${sectionTraceUrl}`, (route) => route.fulfill({ json: sectionTrace }));
  await page.goto(`/?trace=${encodeURIComponent(sectionTraceUrl)}&step=${padCount + 1}&animate=1`);

  const heading = page.getByRole('heading', { name: 'Next topic' });
  await expect(heading).toBeVisible();
  await expect.poll(async () => {
    const box = await heading.boundingBox();
    return box ? box.y : null;
  }).toBeLessThan(80);
});

test('scrolls the current image line toward the viewport center', async ({ page }) => {
  const imageTraceUrl = '/centered-image-fixture.json';
  const padCount = 18;
  const imageTrace = {
    formatVersion: 2,
    files: {
      'image.py': `${Array.from({ length: padCount }, (_, index) => `text("Pad ${index}")`).join('\n')}\nimage("chart.png")\n`,
    },
    frames: Array.from({ length: padCount + 1 }, (_, index) => ({
      path: 'image.py', line_number: index + 1, function_name: 'main', invocation_id: 1,
    })),
    renderings: [
      ...Array.from({ length: padCount }, (_, index) => [{ type: 'markdown', data: `Pad ${index}` }]),
      [{
        type: 'image',
        data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        alt: 'Centered report',
        style: { width: 640, height: 480 },
      }],
    ],
    outputs: Array.from({ length: padCount + 1 }, () => ''),
    steps: Array.from({ length: padCount + 1 }, (_, index) => [[index], index, index, 0, {}]),
  };

  await page.route(`**${imageTraceUrl}`, (route) => route.fulfill({ json: imageTrace }));
  await page.goto(`/?trace=${encodeURIComponent(imageTraceUrl)}&step=${padCount}&animate=1`);

  const image = page.getByRole('img', { name: 'Centered report' });
  await expect(image).toBeVisible();
  await expect.poll(async () => {
    const box = await image.boundingBox();
    const viewport = page.viewportSize();
    if (!box || !viewport) return false;
    return box.y >= 0 && box.y < viewport.height * 0.55 && box.y + Math.min(box.height, 120) < viewport.height;
  }).toBeTruthy();
});

test('plays the bundled example from the landing', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Play the example talk/ }).click();
  await expect(page.getByRole('heading', { name: 'Checkout timeouts' })).toBeVisible();
  await expect(page).toHaveURL(/presentations\.example\.json/);
});

test('opens a local snapshot from the file picker and keeps presenter comments', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Code-first slides' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Play the example talk/ })).toBeVisible();
  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('alert')).toContainText('Choose a file or enter a snapshot URL');

  await page.getByLabel('Choose snapshot file').setInputFiles({
    name: 'picked.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(fixture)),
  });
  await expect(page.getByRole('heading', { name: 'Browser fixture' })).toBeVisible();
  await expect(page).toHaveURL(/trace=local/);

  await page.keyboard.press('p');
  const comments = page.getByLabel('Comments');
  await comments.fill('Remember the demo count');
  await expect(comments).toHaveValue('Remember the demo count');
  await page.getByRole('slider', { name: 'Presentation step' }).fill('1');
  await expect(comments).toHaveValue('');
  await page.getByRole('slider', { name: 'Presentation step' }).fill('0');
  await expect(comments).toHaveValue('Remember the demo count');
});
