import { expect, type Page } from "@playwright/test";

export type SeedProfile = {
  goal: "eat_well" | "cut" | "bulk" | "condition";
  condition?: string | null;
  limits?: string[];
  targets?: { kcal: number; protein: number } | null;
};

/** Starts the app with this profile already saved (skipping onboarding), and nothing else stored. */
export async function seed(page: Page, p: SeedProfile | null) {
  const profile = p && {
    condition: null,
    limits: [],
    limits_other: [],
    appliances: ["stove", "microwave", "fridge"],
    servings: 1,
    targets: null,
    ...p,
  };
  await page.addInitScript((prof) => {
    if (sessionStorage.getItem("seeded")) return;
    localStorage.clear();
    if (prof) localStorage.setItem("pantry.profile.v1", JSON.stringify(prof));
    sessionStorage.setItem("seeded", "1");
  }, profile);
}

/** Every uncaught error and console error, so a test can insist there were none. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return errors;
}

/**
 * The visible element with this exact text. React Navigation keeps earlier
 * screens mounted but hidden, so the first match isn't always the one on screen.
 */
export const text = (page: Page, t: string, exact = true) => page.getByText(t, { exact }).locator("visible=true").first();
export const labelled = (page: Page, l: string) => page.getByLabel(l, { exact: true }).locator("visible=true").first();

export async function openHome(page: Page) {
  await page.goto("/");
  await expect(text(page, "What's in the fridge?")).toBeVisible({ timeout: 60_000 });
}

/** Picks rice and corn, enters a budget and deals. Waits for the deck. */
export async function deal(page: Page, budget = "15") {
  await text(page, "White rice").click();
  await text(page, "Corn").click();
  await labelled(page, "Budget in Canadian dollars").fill(budget);
  await text(page, "Deal me meals").click();
  await expect(text(page, "1 of 6", false)).toBeVisible();
}

/** Drags the top card sideways like a finger would. */
export async function swipe(page: Page, dir: "left" | "right") {
  const x0 = 195;
  await page.mouse.move(x0, 330);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x0 + (dir === "right" ? i : -i) * 12, 332, { steps: 2 });
  await page.mouse.up();
}
