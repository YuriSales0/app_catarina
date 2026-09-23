import { test, expect, type Page } from "@playwright/test";

async function devLogin(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("the dashboard shows evidence-backed state, the next lesson's reason, and lets a parent decide a recommendation", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  const catarina = page.locator("section", { has: page.getByRole("heading", { name: /Catarina/ }) });
  await expect(catarina.getByRole("heading", { name: "English" })).toBeVisible();
  await expect(catarina.getByText("Greetings").first()).toBeVisible();
  await expect(catarina.getByText(/\d\/\d+ recent/).first()).toBeVisible();
  await expect(catarina.getByText(/Next:/).first()).toBeVisible();

  // Recommendations from the seeded lessons are proposals with an outcome.
  const recs = catarina.locator("li", { hasText: "proposed by next lesson engine" });
  const before = await recs.count();
  expect(before).toBeGreaterThan(0);
  await recs.first().getByRole("button", { name: "Accept" }).click();
  await expect(catarina.locator("li", { hasText: "proposed by next lesson engine" })).toHaveCount(before - 1);

  // "Why" leads to the engine's rationale, not a narrative.
  await catarina.getByRole("link", { name: "why" }).first().click();
  await expect(page.getByRole("heading", { name: "Why this objective" })).toBeVisible();
  await expect(page.getByText(/next objective in the curriculum order|developing|practised/).first()).toBeVisible();
  await expect(page.getByText("Alternatives considered", { exact: false })).toBeVisible();
  await page.getByText("Score breakdown", { exact: false }).click();
  await expect(page.getByText(/total:/)).toBeVisible();

  // Progress page shows the full map with counts.
  await page.goto("/students");
  await page.getByRole("link", { name: "Catarina" }).click();
  await page.getByRole("link", { name: "English" }).click();
  await page.getByRole("link", { name: "Progress" }).click();
  await expect(page.getByRole("heading", { name: /Progress/ })).toBeVisible();
  await expect(page.getByText("By skill")).toBeVisible();
  await expect(page.getByText("Recent state changes")).toBeVisible();
});
