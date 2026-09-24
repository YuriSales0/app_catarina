import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

test("the dashboard shows evidence-backed state, the next lesson's reason, and lets a parent decide a recommendation", async ({ page }) => {
  await devLogin(page, "demo.parent@learning-os.local", "Demo Parent");
  const catarina = page.locator("section", { has: page.getByRole("heading", { name: /Catarina/ }) });
  await expect(catarina.getByText("Aula de hoje · English")).toBeVisible();
  await expect(catarina.getByText("Greetings").first()).toBeVisible();
  await expect(catarina.getByText(/\d+ de \d+ recentes/).first()).toBeVisible();

  // Recommendations from the seeded lessons are proposals with an outcome.
  await catarina.getByText(/Sugestões do planejador/).click();
  const recs = catarina.locator("li", { hasText: "sugerido pelo planejador" });
  const before = await recs.count();
  expect(before).toBeGreaterThan(0);
  await recs.first().getByRole("button", { name: "Aceitar" }).click();
  await expect(catarina.locator("li", { hasText: "sugerido pelo planejador" })).toHaveCount(before - 1);

  // "Why" leads to the engine's rationale, not a narrative.
  await catarina.getByRole("link", { name: "por quê?" }).first().click();
  await expect(page.getByRole("heading", { name: "Por que esta aula?" })).toBeVisible();
  await expect(page.getByText(/próximo passo da trilha|ganhando confiança|praticado/i).first()).toBeVisible();
  await expect(page.getByText("Outras opções consideradas", { exact: false })).toBeVisible();
  await page.getByText("Pontuação do planejador", { exact: false }).click();
  await expect(page.getByText(/total:/)).toBeVisible();

  // The development page shows the full map with counts.
  await page.goto("/students");
  await page.getByRole("link", { name: /Catarina/ }).click();
  await page.getByRole("link", { name: /English/ }).click();
  await page.getByRole("link", { name: /Desenvolvimento/ }).click();
  await expect(page.getByRole("heading", { name: /Catarina · English/ })).toBeVisible();
  await expect(page.getByText("Onde cada objetivo está")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Habilidades" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conquistas recentes" })).toBeVisible();
});
