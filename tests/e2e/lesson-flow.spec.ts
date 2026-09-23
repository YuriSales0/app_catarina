import { test, expect, type Page } from "@playwright/test";

async function devLogin(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("a parent runs a manual lesson end to end with no AI configured", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  await page.goto("/students");
  await page.getByRole("link", { name: "Aurora" }).click();
  await page.getByRole("link", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: /Aurora · English/ })).toBeVisible();

  // Only unlocked objectives are offered; the first root objective is selectable.
  const select = page.locator('select[name="primaryObjectiveId"]');
  await expect(select.locator("option", { hasText: "Greetings" })).toHaveCount(1);
  await expect(select.locator("option", { hasText: "My name is" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create lesson" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: /Lesson \d+ · Greetings/ })).toBeVisible();

  await page.getByRole("button", { name: "Start lesson" }).click();
  await expect(page.getByText("in progress", { exact: false }).first()).toBeVisible();

  // Record three attempts against the practice activity.
  const practice = page.locator("li.card", { hasText: "practice" }).first();
  const attempts = [
    ["Say hello", "Hello", "CORRECT"],
    ["Say goodbye", "Tchau", "INCORRECT"],
    ["Good morning!", "Good morning", "CORRECT"],
  ] as const;
  for (const [i, [prompt, response, result]] of attempts.entries()) {
    const form = practice.locator("form");
    await form.locator('input[name="prompt"]').fill(prompt);
    await form.locator('input[name="studentResponse"]').fill(response);
    await form.locator(`input[name="result"][value="${result}"]`).check();
    if (result === "INCORRECT") await form.locator('input[name="errorTags"]').first().check();
    await form.getByRole("button", { name: "Record attempt" }).click();
    // Wait for the server re-render before touching the form again.
    await expect(practice.getByText(`${i + 1} of ~5 attempts recorded`)).toBeVisible();
  }

  await page.locator('textarea[name="teacherNote"]').fill("She was shy at first.");
  await page.getByRole("button", { name: "Complete lesson and generate report" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/report$/);
  await expect(page.getByRole("heading", { name: "Observed", exact: true })).toBeVisible();
  await expect(page.getByText("3 total · 2 correct · 0 partial · 1 incorrect")).toBeVisible();
  await expect(page.getByText("She was shy at first.")).toBeVisible();
  await expect(page.getByText("human 3 · system 0 · AI 0")).toBeVisible();

  // The explanation page traces the status to the evidence.
  await page.getByRole("link", { name: "Greetings" }).first().click();
  await expect(page.getByRole("heading", { name: "Why this status" })).toBeVisible();
  await expect(page.getByText("Assessed attempts")).toBeVisible();
  await expect(page.getByText("● ", { exact: false }).first()).toBeVisible();
});
