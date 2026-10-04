import { expect, test } from "@playwright/test";

// Mock mode cannot backtest or read instructions, so this walks the What-if panel's controls and
// wiring, not its numbers.

test("a judge adds and drops signals, asks the AI, runs the what-if and asks why", async ({ page, isMobile }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/agents/accountant");
  if (isMobile) await page.getByRole("tab", { name: /PERFORMANCE/i }).click();

  // The panel starts open.
  await expect(page.getByRole("button", { name: /WHAT IF · TUNE THE RECIPE YOURSELF/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const panel = page.getByRole("region", { name: "What if" });

  await panel.getByRole("combobox", { name: "Add a signal" }).selectOption("funding_stress");
  await expect(panel.getByRole("button", { name: "Drop funding_stress" })).toBeVisible();
  await expect(panel.getByRole("note")).toContainText("cannot rank stocks");
  await panel.getByRole("button", { name: "Drop funding_stress" }).click();
  await panel.getByRole("combobox", { name: "Add a signal" }).selectOption("atm_iv");
  await panel.getByRole("button", { name: "Drop kl_surprise_bits" }).click();
  await expect(panel.getByRole("button", { name: "Drop kl_surprise_bits" })).toHaveCount(0);

  await panel.getByPlaceholder(/lean harder into valuation/).fill("drop the volatility signal");
  await panel.getByRole("button", { name: "RECOMPILE WITH AI" }).click();
  await expect(panel.getByText(/DRAFT UNCHANGED/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Drop atm_iv" })).toBeVisible();

  await panel.getByRole("button", { name: "RUN WHAT-IF" }).click();
  await expect(panel.getByText(/WHAT-IF RESULT/)).toBeVisible();

  await panel.getByRole("button", { name: "ASK WHY" }).click();
  const chat = page.getByRole("region", { name: "Chat" });
  await expect(chat.getByText("Why does my what-if do better or worse than you, and should I trust it?")).toBeVisible();
  await expect(chat.getByText(/EVIDENCE/).last()).toBeVisible();
  expect(errors).toEqual([]);
});
