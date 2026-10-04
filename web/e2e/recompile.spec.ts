import { expect, test } from "@playwright/test";

// Mock mode cannot backtest, so this walks the editable recipe and the recompile wiring.

test("a judge edits the compiled recipe and recompiles the agent", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/agents/accountant");

  await page.getByRole("button", { name: /COMPILED RECIPE/ }).click();
  const top = page.getByRole("spinbutton").first();
  await top.fill("9");
  await expect(page.getByText(/RECIPE EDITED, NOT COMPILED/)).toBeVisible();

  await page.getByRole("button", { name: "RECOMPILE", exact: true }).click();

  // After the stream the page reloads the agent: the card shows the new recipe as compiled.
  await expect(page.getByText(/RECIPE EDITED, NOT COMPILED/)).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: /COMPILED RECIPE/ })).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("spinbutton").first()).toHaveValue("9");
  expect(errors).toEqual([]);
});
