import { expect, type Page } from "@playwright/test";

/** Development sign-in. A parent with no children lands on first steps, otherwise on the dashboard. */
export async function devLogin(page: Page, email: string, name: string) {
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Nome").fill(name);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/(dashboard|boas-vindas)/);
}
