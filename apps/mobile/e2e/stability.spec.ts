import { expect, test } from "@playwright/test";
import { openHome, seed, text, watchErrors } from "./helpers";

/**
 * Guards against render loops like the price-table refetch bug: the app
 * looked fine but its main thread never went idle, so taps hung.
 */
test("the price table loads once, and the app stays responsive at rest", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "eat_well" });
  await page.addInitScript(() => {
    const w = window as unknown as { __priceWrites: number };
    w.__priceWrites = 0;
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === "pantry.prices.v1") w.__priceWrites++;
      return set.call(this, k, v);
    };
  });
  await openHome(page);
  await page.waitForTimeout(3000);

  const writes = await page.evaluate(() => (window as unknown as { __priceWrites: number }).__priceWrites);
  expect(writes).toBe(1);

  // A busy main thread shows up as a slow tap.
  const t0 = Date.now();
  await text(page, "White rice").click({ timeout: 2000 });
  expect(Date.now() - t0).toBeLessThan(2000);

  // Frames keep coming at a normal rate: count animation frames over half a second.
  const frames = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let n = 0;
        const end = performance.now() + 500;
        const tick = () => (performance.now() < end ? (n++, requestAnimationFrame(tick)) : resolve(n));
        requestAnimationFrame(tick);
      }),
  );
  expect(frames).toBeGreaterThan(15);
  expect(errors).toEqual([]);
});
