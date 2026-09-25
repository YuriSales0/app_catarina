import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

const unique = Date.now().toString(36);

test("the landing page is public and unauthenticated visitors of the app are sent to login", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Inglês de verdade/ })).toBeVisible();
  await page.goto("/students");
  await expect(page).toHaveURL(/\/login/);
});

test("a new parent goes through first steps, and cannot see another parent's child", async ({ browser }) => {
  const ctxA = await browser.newContext();
  const a = await ctxA.newPage();
  await devLogin(a, `parent-a-${unique}@example.test`, "Parent A");

  // A parent with no children is taken to first steps.
  await a.goto("/dashboard");
  await expect(a).toHaveURL(/\/boas-vindas/);
  await a.getByLabel("Primeiro nome").fill("Beatriz");
  await a.locator('input[name="dateOfBirth"]').fill("2018-05-20");
  await a.getByText("Raposa").click();
  await a.getByRole("button", { name: "Continuar" }).click();
  await expect(a).toHaveURL(/passo=2/);
  await expect(a.getByText(/já teve contato com inglês\?/)).toBeVisible();
  await a.locator("label", { hasText: "Está começando agora" }).click();
  await a.getByRole("button", { name: "Continuar" }).click();
  await expect(a).toHaveURL(/passo=3/);
  await a.getByRole("button", { name: "Agora não" }).click();
  await expect(a).toHaveURL(/passo=4/);
  await expect(a.getByRole("heading", { name: "Tudo pronto, Beatriz!" })).toBeVisible();
  await expect(a.getByText(/Trilha Starters \(Pre A1\)/)).toBeVisible();

  await a.goto("/students");
  await a.getByRole("link", { name: /Beatriz/ }).click();
  await expect(a).toHaveURL(/\/students\/[0-9a-f-]{36}$/);
  const studentUrl = a.url();
  await expect(a.getByRole("heading", { name: "Beatriz" })).toBeVisible();
  await expect(a.getByRole("link", { name: /English/ })).toBeVisible();

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
  await expect(page.getByRole("link", { name: /Catarina/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Aurora/ })).toBeVisible();
  await expect(page.getByText("DEMO").first()).toBeVisible();
});

test("the Curriculum Studio validates, rejects a cycle, and publishes a private curriculum", async ({ page }) => {
  await devLogin(page, `author-${unique}@example.test`, "Author");
  await page.goto("/curricula/new");
  const textarea = page.getByLabel("YAML do currículo");
  await page.getByRole("button", { name: "Validar" }).click();
  await expect(page.getByText("Válido.")).toBeVisible();

  const good = await textarea.inputValue();
  const cyclic = good.replace("        skills: [speaking]\n      - key: EN.U1.HAVE_NEG", "        skills: [speaking]\n        prerequisites: [EN.U1.HAVE_NEG]\n      - key: EN.U1.HAVE_NEG");
  await textarea.fill(cyclic);
  await page.getByRole("button", { name: "Validar" }).click();
  await expect(page.getByRole("alert").getByText(/cycle|comes later/)).toBeVisible();

  await textarea.fill(good.replace("slug: my-family-english", `slug: fam-${unique}`));
  await page.getByLabel("Publicar agora").check();
  await page.getByRole("button", { name: "Salvar currículo" }).click();
  await expect(page).toHaveURL(/\/curricula\/[0-9a-f-]{36}$/);
  await expect(page.getByText("publicado", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("I don't have...")).toBeVisible();

  await page.goto("/curricula");
  await expect(page.getByText("My family English")).toBeVisible();
  await expect(page.getByText("English Starters (Cambridge Pre A1 aligned)")).toBeVisible();
});
