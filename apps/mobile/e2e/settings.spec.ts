import { expect, test } from "@playwright/test";
import { labelled, openHome, seed, text, watchErrors } from "./helpers";

test("settings: changing the goal clears targets; redo my numbers sets new ones", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "cut", targets: { kcal: 2345, protein: 126 } });
  await openHome(page);
  await labelled(page, "Settings").click();
  await expect(text(page, "~2,345 kcal · ~126 g protein")).toBeVisible();

  await text(page, "Bulk").click();
  await expect(page.getByRole("button", { name: "Redo my numbers" }).locator("visible=true")).toBeDisabled();
  await text(page, "Save changes").click();
  await expect(text(page, "Saved. Your goal changed, so tap Redo my numbers to set new daily targets.")).toBeVisible();
  await expect(text(page, "Not set")).toBeVisible();

  await text(page, "Redo my numbers").click();
  await labelled(page, "Height in cm").fill("180");
  await labelled(page, "Weight in kg").fill("80");
  await labelled(page, "Age in years").fill("30");
  await text(page, "Male").click();
  await text(page, "Moderate").click();
  await text(page, "Save").click();

  await expect(text(page, "~3,035 kcal · ~144 g protein")).toBeVisible();
  await expect(text(page, "No changes yet")).toBeVisible();
  expect(errors).toEqual([]);
});
