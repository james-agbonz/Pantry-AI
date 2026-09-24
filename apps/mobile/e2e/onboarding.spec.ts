import { expect, test } from "@playwright/test";
import { labelled, seed, text, watchErrors } from "./helpers";

test("onboarding: four screens, saved, and skipped on the next launch", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, null);
  await page.goto("/");
  await expect(text(page, "What's the goal?")).toBeVisible({ timeout: 60_000 });
  await text(page, "Cut").click();

  await expect(text(page, "Anything you never eat?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Next", exact: true }).locator("visible=true")).toBeDisabled();
  await text(page, "Halal").click();
  await labelled(page, "Something else you never eat").fill("cilantro");
  await text(page, "Add").click();
  await text(page, "Next").click();

  await expect(text(page, "What can you cook with?")).toBeVisible();
  await text(page, "Stove, fridge and microwave").click();

  await expect(text(page, "Cooking for how many?")).toBeVisible();
  await labelled(page, "More").click();
  await text(page, "Done").click();

  await expect(text(page, "What's in the fridge?")).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("pantry.profile.v1")!));
  expect(saved).toMatchObject({ goal: "cut", limits: ["halal"], limits_other: ["cilantro"], appliances: ["stove", "fridge", "microwave"], servings: 2, targets: null });

  await page.reload();
  await expect(text(page, "What's in the fridge?")).toBeVisible();
  expect(errors).toEqual([]);
});
