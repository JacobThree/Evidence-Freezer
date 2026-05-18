import { expect, type Page, test } from '@playwright/test';

const promptInjectionCaseId = 'case-trace_seed_prompt_injection';

test.describe('dashboard browser behavior', () => {
  test('case list is keyboard reachable and console-clean', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto('/cases');
    await expect(page.getByRole('heading', { name: 'Case files' })).toBeVisible();

    await page.getByLabel('Severity').selectOption('high');
    await page.getByRole('button', { name: 'Apply' }).click();
    await expect(page).toHaveURL(/severity=high/);
    await expect(page.getByRole('link', { name: promptInjectionCaseId })).toBeVisible();

    await page.goto('/cases?severity=high');
    await expectReachableByKeyboard(page, [
      'select[name="severity"]',
      'select[name="status"]',
      'select[name="incident_type"]',
      'button[type="submit"]',
      'a[href="/cases"]',
      `a[href="/cases/${promptInjectionCaseId}"]`,
    ]);
    expect(consoleErrors).toEqual([]);
  });

  test('case detail exposes approval controls without horizontal overflow', async ({ page }) => {
    const consoleErrors = collectConsoleErrors(page);

    await page.goto(`/cases/${promptInjectionCaseId}`);
    await expect(page.getByRole('heading', { name: promptInjectionCaseId })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Approve for test' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reject' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'False positive' })).toBeVisible();

    await expectReachableByKeyboard(page, [
      'a[href="/cases"]',
      'a[href^="http://localhost:6006/projects/evidence-freezer/traces/"]',
      'button:has-text("Approve for test")',
      'button:has-text("Reject")',
      'button:has-text("False positive")',
    ]);
    expect(await overflowingElements(page)).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  return errors;
}

async function expectReachableByKeyboard(page: Page, selectors: string[]): Promise<void> {
  for (const selector of selectors) {
    await page.keyboard.press('Tab');
    await expect(page.locator(selector)).toBeFocused();
  }
}

async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    return Array.from(document.body.querySelectorAll<HTMLElement>('*'))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && (rect.left < -1 || rect.right > viewportWidth + 1);
      })
      .map((element) => {
        const className = typeof element.className === 'string' ? `.${element.className}` : '';
        return `${element.tagName.toLowerCase()}${className}`;
      });
  });
}
