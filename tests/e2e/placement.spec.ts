import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

const unique = Date.now().toString(36);

test("a child with some English takes a level check first, and the family confirms where to start", async ({ page }) => {
  await devLogin(page, `parent-level-${unique}@example.test`, "Parent Level");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/boas-vindas/);
  await page.getByLabel("Primeiro nome").fill("Nina");
  await page.locator('input[name="dateOfBirth"]').fill("2018-02-10");
  await page.getByText("Raposa").click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByText("Nina já teve contato com inglês?")).toBeVisible();
  await page.locator("label", { hasText: "Já teve contato com inglês" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto, Nina!" })).toBeVisible();

  // The profile says what happens next, and the next lesson is the level check.
  await page.goto("/students");
  await page.getByRole("link", { name: /Nina/ }).click();
  await expect(page.getByText(/A próxima aula é um teste rápido de nível/)).toBeVisible();
  await expect(page.getByRole("button", { name: /Fazer o teste com o Lumi/ })).toBeVisible();
  // The dashboard offers the same, and says it is a level check.
  await page.goto("/dashboard");
  await expect(page.getByText("Teste de nível", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /No ChatGPT/ })).toBeVisible();
  await page.goto("/students");
  await page.getByRole("link", { name: /Nina/ }).click();
  await page.getByRole("button", { name: /Fazer o teste no ChatGPT/ }).click();
  await expect(page).toHaveURL(/\/chatgpt$/);
  const script = await page.getByLabel("Roteiro da aula").inputValue();
  expect(script).toContain("teste rápido de nível");
  const request = await page.getByLabel("Pedido de fechamento").inputValue();
  const code = request.match(/"lesson_code": "([A-Z0-9]+)"/)![1];
  const units = [...request.matchAll(/(\d+) = Teste: ([^;.]+)/g)].map((m) => ({ activity: Number(m[1]), name: m[2].trim() }));
  expect(units.length).toBeGreaterThanOrEqual(3);

  // She knows the first two modules and not the third.
  const closing = {
    format: "learning-os-closing.v1",
    lesson_code: code,
    minutes: 10,
    activities: units.slice(0, 3).map((u, i) => ({
      activity: u.activity,
      attempts: [0, 1].map((j) => ({ prompt: `pergunta ${i}.${j}`, expected: null, child_said: "resposta", result: i < 2 ? "CORRECT" : "INCORRECT" })),
    })),
    summary: "Sabe cumprimentar e as cores; ainda não a família.",
    went_well: [],
    was_hard: [],
    next_time: null,
  };
  await page.getByLabel("Fechamento do ChatGPT").fill("```json\n" + JSON.stringify(closing) + "\n```");
  await page.getByRole("button", { name: "Registrar o fechamento" }).click();
  await expect(page).toHaveURL(/\/report$/);
  await expect(page.getByText("sugerimos começar pelo módulo")).toBeVisible();

  // Nothing changes until the family confirms.
  await page.getByRole("button", { name: `Começar pelo módulo ${units[2].name}` }).click();
  await expect(page).toHaveURL(/\/next-lesson$/);
  await expect(page.getByText(/antes do ponto de partida/).first()).toBeAttached();
});
