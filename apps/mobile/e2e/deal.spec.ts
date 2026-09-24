import { expect, test } from "@playwright/test";
import { deal, labelled, openHome, seed, swipe, text, watchErrors } from "./helpers";

test("home → loading → deck: swipe, rewind, pass all, new deck", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "eat_well", limits: ["halal"] });
  await openHome(page);

  // Halal hides the pork family only; Deal says why it's disabled.
  await expect(text(page, "Pork")).toHaveCount(0);
  await expect(text(page, "Chicken & turkey")).toBeVisible();
  await expect(text(page, "Tap at least one thing you have")).toBeVisible();

  await text(page, "White rice").click();
  await text(page, "Corn").click();
  await labelled(page, "Budget in Canadian dollars").fill("15");
  await text(page, "Deal me meals").click();
  await expect(text(page, "Reading your ingredients")).toBeVisible();
  await expect(text(page, "1 of 6", false)).toBeVisible();

  // Placeholder prices are never called typical.
  await expect(text(page, "Sample prices for testing, not real.")).toBeVisible();
  await expect(page.getByText("typical", { exact: false }).locator("visible=true")).toHaveCount(0);

  await expect(labelled(page, "Rewind")).toBeDisabled();
  await swipe(page, "left");
  await expect(text(page, "2 of 6", false)).toBeVisible();
  await labelled(page, "Rewind").click();
  await expect(text(page, "1 of 6", false)).toBeVisible();

  for (let i = 0; i < 6; i++) {
    await labelled(page, "Pass").click();
    await page.waitForTimeout(350);
  }
  await expect(text(page, "That's all six")).toBeVisible();
  await text(page, "Deal a new deck").click();
  await expect(text(page, "1 of 6 · 1 deck left today", false)).toBeVisible();
  expect(errors).toEqual([]);
});

test("swipe right on a cut: body stats in ft/lb first, then the meal, swap and copy", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "cut" });
  await openHome(page);
  await deal(page);
  await swipe(page, "right");

  await expect(text(page, "What are your numbers?")).toBeVisible();
  await text(page, "ft · lb").click();
  await labelled(page, "Height, feet").fill("5");
  await labelled(page, "Height, inches").fill("14");
  await expect(text(page, "Inches should be 0 to 11")).toBeVisible();
  await labelled(page, "Height, inches").fill("11");
  await labelled(page, "Weight in lb").fill("176");
  await labelled(page, "Age in years").fill("30");
  await text(page, "Male").click();
  await text(page, "Moderate").click();
  await labelled(page, "Target weight in lb, optional").fill("154");
  await text(page, "Save").click();

  await expect(text(page, "Copy shopping list")).toBeVisible();
  const targets = await page.evaluate(() => JSON.parse(localStorage.getItem("pantry.profile.v1")!).targets);
  expect(targets).toEqual({ kcal: 2345, protein: 126 });
  await expect(text(page, "Logged for today.", false)).toBeVisible();

  const before = await page.locator("text=/^~\\$\\d+\\.\\d\\d$/").first().innerText();
  await page.getByRole("button", { name: /Swap$/ }).locator("visible=true").first().click();
  await expect(text(page, "Keep this one")).toBeVisible();
  await page.getByRole("radio").locator("visible=true").last().click();
  await expect(text(page, "Keep this one")).toBeHidden();
  const after = await page.locator("text=/^~\\$\\d+\\.\\d\\d$/").first().innerText();
  expect(after).not.toBe(before);

  await text(page, "Copy shopping list").click();
  await expect(text(page, "Copied. Paste it into your notes or a message.")).toBeVisible();
  const list = await page.evaluate(() => navigator.clipboard.readText());
  expect(list).toMatch(/^.+\n\nBuy \(~\$\d+\.\d\d of \$15\):\n- /);
  expect(list.trimEnd().endsWith("Sample prices for testing, not real.")).toBe(true);
  expect(errors).toEqual([]);
});
