import { expect, test } from "@playwright/test";
import { deal, labelled, openHome, seed, swipe, text, watchErrors } from "../e2e/helpers";

/** Seeds a fixed device ID, so each test is its own phone to the server. */
async function asDevice(page: import("@playwright/test").Page, id: string) {
  await page.addInitScript((d) => localStorage.setItem("pantry.device.v1", d), id);
}

test("deals through /api/deck: the stages come over HTTP, then the deck and the meal", async ({ page }) => {
  const errors = watchErrors(page);
  const calls: string[] = [];
  page.on("request", (r) => r.url().includes("/api/") && calls.push(`${r.method()} ${new URL(r.url()).pathname}`));
  await seed(page, { goal: "eat_well" });
  await asDevice(page, "device-e2e-api-000000001");
  await openHome(page);
  await deal(page);
  expect(calls).toContain("POST /api/deck");
  expect(calls).toContain("GET /api/prices");
  // The server's count: two left after one deck.
  await expect(text(page, "1 of 6 · 2 decks left today", false)).toBeVisible();
  await swipe(page, "right");
  await expect(text(page, "Copy shopping list")).toBeVisible();
  expect(errors).toEqual([]);
});

test("the server's limit holds even when the phone forgets its own count", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "eat_well" });
  await asDevice(page, "device-e2e-api-000000002");
  await openHome(page);
  for (let i = 0; i < 3; i++) {
    await deal(page);
    await labelled(page, "Back to home").click();
    // Wipe the phone's own count, as a reinstall of the counter would: the server still knows.
    await page.evaluate(() => localStorage.removeItem("pantry.decks.v1"));
    await page.reload();
    await expect(text(page, "What's in the fridge?")).toBeVisible();
    await page.waitForTimeout(1500); // Stay under the per-IP burst limit.
  }
  await text(page, "White rice").click();
  await labelled(page, "Budget in Canadian dollars").fill("15");
  await text(page, "Deal me meals").click();
  await expect(text(page, "That's today's decks")).toBeVisible();
  await expect(text(page, "Three a day, free. More tomorrow.")).toBeVisible();
  await text(page, "Back to home").click();
  await expect(text(page, "That's today's decks. More tomorrow.")).toBeVisible();
  // A refused request shows up as a console error in the browser; nothing else may.
  expect(errors.filter((e) => !/429/.test(e))).toEqual([]);
});
