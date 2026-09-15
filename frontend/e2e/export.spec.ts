import { expect, Page, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { loginAs } from './helpers';

async function download(page: Page, format: string) {
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${format}`) }).click()]);
  return { name: file.suggestedFilename(), body: await readFile((await file.path())!) };
}

test('Eksport: giver laster ned CSV og Excel fra historikk', async ({ page }) => {
  await loginAs(page, 'jonas.hem@skanska.no');
  await page.goto('/g/list');
  await page.getByRole('tab', { name: 'Historikk' }).click();
  await page.getByRole('button', { name: /Eksporter historikk/ }).click();
  const csv = await download(page, 'CSV');
  expect(csv.name).toBe('returapp-hentinger.csv');
  expect([...csv.body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  expect(csv.body.toString('utf8', 3)).toMatch(/^Referanse;Opprettet;Status;Kategori;Tittel/);
  await expect(page.getByRole('status')).toHaveText('CSV-fil lastet ned');

  await page.getByRole('button', { name: /Eksporter historikk/ }).click();
  const xlsx = await download(page, 'Excel');
  expect(xlsx.body.subarray(0, 2).toString()).toBe('PK');
});

test('Eksport: admin laster ned PDF-rapport fra statistikk', async ({ page }) => {
  await loginAs(page, 'silje@ombruksfabrikken.no');
  await page.goto('/a/stats');
  await page.getByRole('button', { name: 'Eksporter rapport' }).click();
  const pdf = await download(page, 'PDF-rapport');
  expect(pdf.body.subarray(0, 4).toString()).toBe('%PDF');
  expect(pdf.body.length).toBeGreaterThan(10_000);
  await expect(page.getByRole('status')).toHaveText('PDF-rapport lastet ned');
});
