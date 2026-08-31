import { expect, test } from '@playwright/test';
import fixture from '../browser/fixtures/presentation.json' with { type: 'json' };


test('production worker and lazy structured renderer load', async ({ page }) => {
  const errors = [];
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/production-fixture.json', (route) => route.fulfill({ json: fixture }));
  await page.goto('/?trace=%2Fproduction-fixture.json&step=2&animate=1');
  await expect(page.getByRole('heading', { name: 'Measurements' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('production MathJax runtime loads local fonts', async ({ page }) => {
  const fontResponses = [];
  page.on('response', (response) => {
    if (response.url().endsWith('.woff')) fontResponses.push(response.status());
  });
  const trace = {
    formatVersion: 2,
    files: { 'math.py': 'text("math")\n' },
    frames: [{ path: 'math.py', line_number: 1, function_name: 'main' }],
    renderings: [[{ type: 'markdown', data: '$x^2 + \\frac{1}{2} + \\sqrt{\\alpha}$' }]],
    outputs: [''],
    steps: [[[0], 0, 0, 0, {}]],
  };
  await page.route('**/production-math.json', (route) => route.fulfill({ json: trace }));
  await page.goto('/?trace=%2Fproduction-math.json&step=0');
  await expect(page.locator('mjx-container')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  expect(fontResponses.length).toBeGreaterThan(0);
  expect(fontResponses.every((status) => status === 200)).toBe(true);
});
