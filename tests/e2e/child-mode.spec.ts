import { test, expect, type Page } from "@playwright/test";

async function devLogin(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("child mode: START LESSON, one activity at a time, quick marks, no ids or scores on screen", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  // Create a lesson for Catarina in Mathematics from the engine.
  await page.goto("/students");
  await page.getByRole("link", { name: "Catarina" }).click();
  await page.getByRole("link", { name: "Mathematics" }).click();
  await page.getByRole("link", { name: "Next lesson" }).click();
  await page.getByRole("button", { name: "Create this lesson" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  await page.getByRole("link", { name: "Child mode" }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);

  await expect(page.getByText("Hello, Catarina!")).toBeVisible();
  await page.getByRole("button", { name: "START LESSON" }).click();
  await expect(page.getByText(/^1 of \d$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Something new" })).toBeVisible();

  // The child surface never shows statuses, confidence or uuids.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/PROFICIENT|DEVELOPING|confidence|[0-9a-f]{8}-[0-9a-f]{4}-/i);

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(/^2 of \d$/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Let's practise" })).toBeVisible();
  await page.locator('input[name="prompt"]').fill("Count to ten");
  await page.getByRole("button", { name: "Got it" }).click();
  await expect(page.getByText("1 recorded in this activity")).toBeVisible();
  await page.locator('input[name="prompt"]').fill("Count backwards from ten");
  await page.getByRole("button", { name: "Not yet" }).click();
  await expect(page.getByText("2 recorded in this activity")).toBeVisible();

  await page.getByRole("button", { name: "Stop here" }).click();
  await expect(page.getByText("Well done, Catarina!")).toBeVisible();

  // The grown-up report shows what was recorded.
  await page.getByRole("link", { name: "Grown-ups: see the report" }).click();
  await expect(page.getByText("2 total · 1 correct · 0 partial · 1 incorrect")).toBeVisible();
});
