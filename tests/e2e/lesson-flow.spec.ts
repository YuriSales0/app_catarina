import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

test("a parent runs a manual lesson end to end with no AI configured", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  await page.goto("/students");
  await page.getByRole("link", { name: /Aurora/ }).click();
  await page.getByRole("link", { name: /English/ }).click();
  await expect(page.getByRole("heading", { name: /Aurora · English/ })).toBeVisible();

  // Only unlocked objectives are offered; the first root objective is selectable.
  await page.getByText("Montar uma aula escolhendo o objetivo").click();
  const select = page.locator('select[name="primaryObjectiveId"]');
  await expect(select.locator("option", { hasText: "Greetings" })).toHaveCount(1);
  await expect(select.locator("option", { hasText: "My name is" })).toHaveCount(0);
  await page.getByRole("button", { name: "Criar aula" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "Greetings", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Começar aula" }).click();
  await expect(page.getByText(/Em andamento/).first()).toBeVisible();

  // Record three attempts against the practice activity.
  const practice = page.locator('li[data-activity="PRACTICE"]').first();
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
    await form.getByRole("button", { name: "Registrar tentativa" }).click();
    // Wait for the server re-render before touching the form again.
    await expect(practice.getByText(`${i + 1} de ~5 tentativas registradas`)).toBeVisible();
  }

  await page.locator('textarea[name="teacherNote"]').fill("She was shy at first.");
  await page.getByRole("button", { name: "Concluir aula e gerar relatório" }).click();
  await expect(page).toHaveURL(/\/lessons\/[0-9a-f-]{36}\/report$/);
  await expect(page.getByRole("heading", { name: "O que aconteceu", exact: true })).toBeVisible();
  await expect(page.getByText("3 tentativas · 2 certas · 0 quase · 1 ainda não")).toBeVisible();
  await expect(page.getByText("She was shy at first.")).toBeVisible();
  await expect(page.getByText("Quem corrigiu: adulto 3 · sistema 0 · IA 0")).toBeVisible();

  // The explanation page traces the status to the evidence.
  await page.getByRole("link", { name: "Greetings" }).first().click();
  await expect(page.getByRole("heading", { name: "Por que este estágio?" })).toBeVisible();
  await expect(page.getByText("Tentativas avaliadas")).toBeVisible();
  await expect(page.getByLabel("decidiu o estágio").first()).toBeVisible();
});
