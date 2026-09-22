import { test, expect, type Page } from "@playwright/test";

const unique = Date.now().toString(36);

async function devLogin(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Name").fill(name);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test("unauthenticated visitors are sent to login", async ({ page }) => {
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login/);
});

test("a parent signs in, creates a student, enrols them, and cannot see another parent's child", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await devLogin(a, `parent-a-${unique}@example.test`, "Parent A");

  await a.goto("/students/new");
  await a.locator('input[name="name"]').fill("Beatriz");
  await a.locator('input[name="dateOfBirth"]').fill("2018-05-20");
  await a.getByRole("button", { name: "Create student" }).click();
  await expect(a).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
  const studentUrl = a.url();
  await expect(a.getByRole("heading", { name: "Beatriz" })).toBeVisible();

  // Enrol in the catalogue English curriculum.
  await a.getByText("Enrol in a subject or change curriculum").click();
  await a.locator('select[name="subjectId"]').selectOption({ label: "English" });
  const startersValue = await a
    .locator('select[name="curriculumVersionId"] option', { hasText: "English Starters" })
    .first()
    .getAttribute("value");
  await a.locator('select[name="curriculumVersionId"]').selectOption(startersValue!);
  await a.locator('input[name="targetLanguage"]').fill("en");
  await a.getByRole("button", { name: "Save enrolment" }).click();
  await expect(a.getByText("Enrolment saved.")).toBeVisible();
  await expect(a.getByRole("link", { name: "English" })).toBeVisible();

  // Parent B cannot see Beatriz: 404, not 403.
  const ctxB = await browser.newContext();
  const b = await ctxB.newPage();
  await devLogin(b, `parent-b-${unique}@example.test`, "Parent B");
  const res = await b.goto(studentUrl);
  expect(res?.status()).toBe(404);
  await b.goto("/students");
  await expect(b.getByText("Beatriz")).toHaveCount(0);

  await ctxA.close();
  await ctxB.close();
});

test("the demo parent sees Catarina and Aurora marked DEMO", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  await page.goto("/students");
  await expect(page.getByRole("link", { name: "Catarina" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aurora" })).toBeVisible();
  await expect(page.getByText("DEMO").first()).toBeVisible();
});

test("the Curriculum Studio validates, rejects a cycle, and publishes a private curriculum", async ({ page }) => {
  await devLogin(page, `author-${unique}@example.test`, "Author");
  await page.goto("/curricula/new");
  const textarea = page.getByLabel("Curriculum YAML");
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByText("Valid.")).toBeVisible();

  const good = await textarea.inputValue();
  const cyclic = good.replace("        skills: [speaking]\n      - key: EN.U1.HAVE_NEG", "        skills: [speaking]\n        prerequisites: [EN.U1.HAVE_NEG]\n      - key: EN.U1.HAVE_NEG");
  await textarea.fill(cyclic);
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByRole("alert").getByText(/cycle|comes later/)).toBeVisible();

  await textarea.fill(good.replace("slug: my-family-english", `slug: fam-${unique}`));
  await page.getByLabel("Publish immediately").check();
  await page.getByRole("button", { name: "Save curriculum" }).click();
  await expect(page).toHaveURL(/\/curricula\/[0-9a-f-]{36}$/);
  await expect(page.getByText("published", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("I don't have...")).toBeVisible();

  await page.goto("/curricula");
  await expect(page.getByText("My family English")).toBeVisible();
  await expect(page.getByText("English Starters (Cambridge Pre A1 aligned)")).toBeVisible();
});
