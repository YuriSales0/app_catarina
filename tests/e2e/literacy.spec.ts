import { test, expect } from "@playwright/test";
import { devLogin } from "./helpers";

const unique = Date.now().toString(36);

test("literacy in Spanish: first steps pick the track, the child's screen speaks Spanish, the album appears", async ({ page }) => {
  await devLogin(page, `literacy-${unique}@example.test`, "Parent L");
  await page.goto("/boas-vindas");
  await page.getByLabel("Primeiro nome").fill("Aurora");
  await page.locator('input[name="dateOfBirth"]').fill("2021-03-10");
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/passo=2/);

  await page.getByRole("link", { name: /Alfabetização em espanhol/ }).click();
  await expect(page.getByText("Aurora já reconhece letras?")).toBeVisible();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/1-wizard.png`, fullPage: true });
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page).toHaveURL(/passo=3/);
  await page.getByRole("button", { name: "Agora não" }).click();
  await expect(page.getByRole("heading", { name: "Tudo pronto, Aurora!" })).toBeVisible();
  await expect(page.getByText(/Trilha Alfabetização em espanhol/)).toBeVisible();

  await page.getByRole("button", { name: "Começar a primeira aula" }).click();
  await expect(page).toHaveURL(/\/play\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: "¡Hola, Aurora!" })).toBeVisible();
  await expect(page.getByText(/Misión de hoy:/)).toBeVisible();
  await page.getByRole("button", { name: /A la misión/ }).click();
  await expect(page.getByRole("heading", { name: "¡Empieza la aventura!" })).toBeVisible();

  await page.getByRole("button", { name: "Parar por aqui" }).click();
  await expect(page.getByRole("heading", { name: /Aurora!$/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Álbum de letras" })).toBeVisible();
  await expect(page.getByText("Isla 2: Las vocales")).toBeVisible();
  if (process.env.SHOTS_DIR) await page.screenshot({ path: `${process.env.SHOTS_DIR}/2-album.png`, fullPage: true });
});
