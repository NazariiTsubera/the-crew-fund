import { expect, test } from "@playwright/test";

// Mock mode serves the committed fixtures, so these assert structure, not market numbers.

test("the War Room shows the fund, the capital split and the crew", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");

  await expect(page.getByText(/AS OF/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("Who runs the money").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText("The Accountant").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/PASS|PROBATION|KILLED/).filter({ visible: true }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("an agent page shows its recipe, its record and an answer with evidence", async ({ page, isMobile }) => {
  await page.goto("/agents/accountant");

  await expect(page.getByText("The Accountant").filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByText(/COMPILED RECIPE/i).filter({ visible: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "How are you doing?" }).click();
  await expect(page.getByText(/EVIDENCE/).filter({ visible: true }).last()).toBeVisible();

  if (isMobile) await page.getByRole("tab", { name: /PERFORMANCE/i }).click();
  await expect(page.getByText(/Equity vs S&P 500/i).filter({ visible: true }).first()).toBeVisible();
});

test("a judge can recruit an agent and land on its page", async ({ page }) => {
  await page.goto("/agents/new");

  await page
    .getByPlaceholder("Tell Gemini what you want this agent to invest in…")
    .fill("Buy stocks where options skew is rising, skip anything illiquid.");
  await page.getByRole("button", { name: "SEND", exact: true }).click();
  const recruit = page.getByRole("button", { name: "RECRUIT AGENT", exact: true });
  await expect(recruit).toBeEnabled({ timeout: 10_000 });
  await recruit.click();

  await expect(page).toHaveURL(/\/agents\/(?!new)[\w-]+$/, { timeout: 30_000 });
  await expect(page.getByText(/EVIDENCE/).filter({ visible: true }).last()).toBeVisible({ timeout: 30_000 });
});

test("the Live floor replays the log", async ({ page }) => {
  await page.goto("/floor");

  await expect(page.getByText(/REPLAY/).filter({ visible: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /PAUSE/i })).toBeVisible();
});
