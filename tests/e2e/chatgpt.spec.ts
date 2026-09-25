import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

const unique = Date.now().toString(36);

test("a parent runs a lesson in their own ChatGPT: copies the script, pastes the closing, and sees it in the report", async ({ page }) => {
  // A fresh family, so no other test shares this child's lessons.
  await devLogin(page, `parent-gpt-${unique}@example.test`, "Parent GPT");
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/boas-vindas/);
  await page.getByLabel("Primeiro nome").fill("Lara");
  await page.locator('input[name="dateOfBirth"]').fill("2018-05-20");
  await page.getByText("Raposa").click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.locator("label", { hasText: "Está começando agora" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto, Lara!" })).toBeVisible();

  await page.goto("/students");
  await page.getByRole("link", { name: /Lara/ }).click();
  await page.getByRole("link", { name: /English/ }).click();
  await page.getByRole("link", { name: "Próxima aula" }).click();
  await page.getByRole("button", { name: "Fazer no ChatGPT" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/chatgpt$/);

  // The script: Lumi's pedagogy and today's concrete material, activity by activity.
  const script = await page.getByLabel("Roteiro da aula").inputValue();
  expect(script).toContain("Você é o Lumi");
  expect(script).toContain("MATERIAL DE HOJE");
  expect(script).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  // The closing is asked for separately, after the voice lesson.
  const request = await page.getByLabel("Pedido de fechamento").inputValue();
  const code = request.match(/"lesson_code": "([A-Z0-9]+)"/)![1];
  const firstActivity = Number(request.match(/"activity": (\d+)/)![1]);
  await expect(page.getByRole("button", { name: "Copiar pedido" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar roteiro" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Abrir o ChatGPT/ })).toHaveAttribute("href", "https://chatgpt.com/");

  // A wrong paste is explained, not recorded.
  await page.getByLabel("Fechamento do ChatGPT").fill("a aula foi ótima!");
  await page.getByRole("button", { name: "Registrar o fechamento" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Não encontrei o bloco de fechamento" })).toBeVisible();

  // ChatGPT's closing, pasted as a whole message.
  const closing = {
    format: "learning-os-closing.v1",
    lesson_code: code,
    minutes: 15,
    activities: [{ activity: firstActivity, attempts: [{ prompt: "Say hello to the puppet", expected: "hello", child_said: "hello!", result: "CORRECT" }] }],
    summary: "Lara cumprimentou o boneco com alegria.",
    went_well: ["Hello"],
    was_hard: ["Goodbye"],
    next_time: "Treinar goodbye numa cena de despedida",
  };
  await page.getByLabel("Fechamento do ChatGPT").fill("Muito bem, Lara!\n```json\n" + JSON.stringify(closing, null, 2) + "\n```");
  await page.getByRole("button", { name: "Registrar o fechamento" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/report$/);
  await expect(page.getByText(/Fechamento da aula no ChatGPT: Lara cumprimentou o boneco/)).toBeVisible();
  await expect(page.getByText(/Próxima aula: Treinar goodbye/)).toBeVisible();
});
