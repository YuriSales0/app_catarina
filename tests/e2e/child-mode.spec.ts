import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

test("child mode: one activity at a time, grown-up marks, no ids, statuses or scores on screen", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  // Plan a lesson for Catarina in Mathematics and open it with the child.
  await page.goto("/students");
  await page.getByRole("link", { name: /Catarina/ }).click();
  await page.getByRole("link", { name: /Mathematics/ }).click();
  await page.getByRole("link", { name: "Próxima aula" }).click();
  await page.getByRole("button", { name: /Começar com a criança/ }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);

  await expect(page.getByRole("heading", { name: "Oi, Catarina!" })).toBeVisible();
  await page.getByRole("button", { name: /Começar!/ }).click();
  await expect(page.getByRole("list", { name: /^Atividade 1 de \d$/ })).toBeVisible();
  // The first lesson of a course opens it: how lessons work, the module's goals, a diagnostic.
  await expect(page.getByRole("heading", { name: "Começando a aventura!" })).toBeVisible();
  await expect(page.locator("li", { hasText: "Cada atividade vale uma estrela" })).toBeVisible();
  await expect(page.getByText(/você vai aprender:/)).toBeVisible();

  // The child surface never shows statuses, confidence or uuids.
  const body = await page.locator("main").innerText();
  expect(body).not.toMatch(/PROFICIENT|DEVELOPING|confidence|confiança|Já consegue|Dominou|[0-9a-f]{8}-[0-9a-f]{4}-/i);

  await page.getByRole("button", { name: "Próximo →" }).click();
  await expect(page.getByRole("list", { name: /^Atividade 2 de \d$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Coisa nova!" })).toBeVisible();
  await page.getByRole("button", { name: "Próximo →" }).click();
  await expect(page.getByRole("list", { name: /^Atividade 3 de \d$/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vamos praticar!" })).toBeVisible();
  await page.locator('input[name="prompt"]').fill("Count to ten");
  await page.getByRole("button", { name: "Acertou" }).click();
  await expect(page.getByText("1 registrada nesta atividade")).toBeVisible();
  await page.locator('input[name="prompt"]').fill("Count backwards from ten");
  await page.getByRole("button", { name: "Ainda não" }).click();
  await expect(page.getByText("2 registradas nesta atividade")).toBeVisible();

  await page.getByRole("button", { name: "Parar por aqui" }).click();
  await expect(page.getByRole("heading", { name: "Parabéns, Catarina!" })).toBeVisible();

  // The grown-up report shows what was recorded.
  await page.getByRole("link", { name: "Adulto: ver como foi a aula" }).click();
  await expect(page.getByText("2 tentativas · 1 certas · 0 quase · 1 ainda não")).toBeVisible();
});
