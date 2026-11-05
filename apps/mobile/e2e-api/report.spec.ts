import { expect, test } from "@playwright/test";
import { labelled, openHome, seed, text, watchErrors } from "../e2e/helpers";

test("report a problem goes over HTTP to /api/report, and the server keeps it", async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, { goal: "eat_well" });
  await openHome(page);
  await labelled(page, "Settings").click();
  await text(page, "Report a problem").click();
  await labelled(page, "What happened").fill("End-to-end report over HTTP");
  const sent = page.waitForResponse((r) => r.url().endsWith("/api/report") && r.request().method() === "POST");
  await text(page, "Send report").click();
  const res = await sent;
  expect(res.status()).toBe(201);
  expect(res.request().postDataJSON()).toEqual({ message: "End-to-end report over HTTP", app_version: "0.1.0", platform: "web" });
  await expect(text(page, "Your report is sent. We read every one.")).toBeVisible();
  expect(errors).toEqual([]);
});
