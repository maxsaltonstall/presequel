import { test, expect } from '@playwright/test';

test('Chapter 1 Puzzle 01 can be solved', async ({ page }) => {
  // Start with clean localStorage
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Wait for the first dialogue bubble (Carol's boss intro) to appear
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });

  // Find the two dropdowns: col (name/id/era/engagement), tbl (clients/engagements/eras)
  const selects = page.locator('.puzzle-area select');
  await expect(selects).toHaveCount(2);
  await selects.nth(0).selectOption('name');
  await selects.nth(1).selectOption('clients');

  // Run button should enable
  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  // Success bubble should appear
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
  // Next button should appear
  await expect(page.locator('.next-btn')).toBeVisible();

  // Results table has 20 rows from the clients seed
  const resultRows = page.locator('.results-table tbody tr');
  await expect(resultRows).toHaveCount(20);
});

test('Wrong answer shows hint without solving', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const selects = page.locator('.puzzle-area select');
  await selects.nth(0).selectOption('id');        // wrong: should be name
  await selects.nth(1).selectOption('clients');
  await page.locator('#run-btn').click();

  // Hint bubble appears, no success bubble
  await expect(page.locator('.bubble.hint')).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('.bubble.success')).toHaveCount(0);
  await expect(page.locator('.next-btn')).toHaveCount(0);
});

test('Chapter 2 loads after state is set to 02-pharaoh', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Plant state so the player starts at Chapter 2, Puzzle 1.
  // (Solving all 5 Ch1 puzzles via the UI would make the smoke slow.)
  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '02-pharaoh',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': {
          completed: true,
          solved: ['01', '02', '03', '04', '05'],
          attempts: {},
        },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  // Two bubbles: boss intro + Pharaoh's brief
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  // Pharaoh's brief mentions "Weni"
  await expect(page.locator('.bubble').last()).toContainText('Weni');

  // Progress indicator shows Chapter 2
  await expect(page.locator('#progress-indicator')).toContainText('Pharaoh');

  // Three dropdowns for col/op/val
  const selects = page.locator('.puzzle-area select');
  await expect(selects).toHaveCount(3);

  // Solve Puzzle 01 canonically
  await selects.nth(0).selectOption('overseer');
  await selects.nth(1).selectOption('=');
  await selects.nth(2).selectOption("'Weni'");
  await page.locator('#run-btn').click();

  // Success
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 3 word-bank puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '03-speakeasy',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  // Boss intro + Gladys brief
  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('schedule');

  // Word bank chips present
  const chips = page.locator('.word-bank-chip');
  await expect(chips.first()).toBeVisible();

  // Two empty slots
  await expect(page.locator('.slot.empty')).toHaveCount(2);

  // Click 'shift_date' chip then 'ASC' chip
  await chips.filter({ hasText: /^shift_date$/ }).click();
  await chips.filter({ hasText: /^ASC$/ }).click();

  // Slots should now be filled
  await expect(page.locator('.slot.empty')).toHaveCount(0);
  await expect(page.locator('.slot.filled')).toHaveCount(2);

  // Run
  await page.locator('#run-btn').click();

  // Success bubble
  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 5 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '05-tavern',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('pour');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  await inputs.nth(0).fill('visit_id, patron_id, visit_date, tab_groschen');
  await inputs.nth(1).fill('visits');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 4 aggregation puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '04-census',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('souls');

  const chips = page.locator('.word-bank-chip');
  await expect(chips.first()).toBeVisible();

  await chips.filter({ hasText: /^COUNT\(\*\)$/ }).click();
  await chips.filter({ hasText: /^census_1890$/ }).click();

  await expect(page.locator('.slot.empty')).toHaveCount(0);

  await page.locator('#run-btn').click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 6 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '06-reunion',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('engagement ledger');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  await inputs.nth(0).fill('engagement_id, client_id, era, year, anomaly_note');
  await inputs.nth(1).fill('chrono_engagements');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 7 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '07-static',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('ten lines');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(2);

  await inputs.nth(0).fill('timestamp, message, tags');
  await inputs.nth(1).fill('logs');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 8 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '08-when',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '07-static':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('MIN and MAX');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(1);

  await inputs.nth(0).fill('logs');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 9 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '09-heat',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '07-static':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '08-when':       { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('counts by the minute');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(1);

  await inputs.nth(0).fill('metrics');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});

test('Chapter 10 typing puzzle can be solved', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.evaluate(() => {
    localStorage.setItem('chronoConsultingState-v1', JSON.stringify({
      currentChapterId: '10-reach',
      currentPuzzleId: '01',
      chapters: {
        '01-onboarding': { completed: true, solved: ['01','02','03','04','05'], attempts: {} },
        '02-pharaoh':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '03-speakeasy':  { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '04-census':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '05-tavern':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '06-reunion':    { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '07-static':     { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '08-when':       { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
        '09-heat':       { completed: true, solved: ['01','02','03','04','05','06'], attempts: {} },
      },
      referenceOpened: [],
      savedAt: Date.now(),
    }));
  });
  await page.reload();

  await expect(page.locator('.bubble')).toHaveCount(2, { timeout: 5000 });
  await expect(page.locator('.bubble').last()).toContainText('auth-svc');

  const inputs = page.locator('.typed-input');
  await expect(inputs).toHaveCount(1);

  await inputs.nth(0).fill('service:auth-svc');

  const runBtn = page.locator('#run-btn');
  await expect(runBtn).toBeEnabled();
  await runBtn.click();

  await expect(page.locator('.bubble.success')).toHaveCount(1, { timeout: 5000 });
});
