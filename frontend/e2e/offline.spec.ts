import { test, expect } from "@playwright/test";

test("create note offline and keep it after reload", async ({ page, context }) => {
  await page.goto("/");

  const collapsedInput = page.getByText("Take a note...").first();
  await expect(collapsedInput).toBeVisible();

  // Create a note while online first so the app is initialized
  await collapsedInput.click();
  await page.locator('textarea[placeholder="Take a note..."]').fill("online note");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("online note")).toBeVisible();

  // Go offline and create another note
  await context.setOffline(true);
  await page.getByText("Take a note...").first().click();
  await page.locator('textarea[placeholder="Take a note..."]').fill("offline note");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("offline note")).toBeVisible();

  // Restore network and reload
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText("online note")).toBeVisible();
  await expect(page.getByText("offline note")).toBeVisible();
});
