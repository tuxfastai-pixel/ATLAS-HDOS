import { expect, test } from "@playwright/test";

async function login(page, username, password) {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function advanceToEnd(page) {
  while (await page.getByRole("button", { name: "Next" }).isVisible()) {
    await page.getByRole("button", { name: "Next" }).click();
  }
}

test.describe.serial("Sprint 007 persisted browser journeys", () => {
  test("Leago saves, resumes at the correct step, and completes The Lost Fossil", async ({ page }) => {
    await login(page, "leago", "atlas123");
    await expect(page.getByRole("heading", { name: "Welcome, Leago" })).toBeVisible();
    await page.getByRole("article").filter({ hasText: "The Lost Fossil" }).getByRole("button").click();
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("button", { name: "Save and exit" }).click();
    await page.getByRole("article").filter({ hasText: "The Lost Fossil" }).getByRole("button", { name: "Resume" }).click();
    await expect(page.getByText(/Step 2 of/)).toBeVisible();
    await advanceToEnd(page);
    const response = page.locator("textarea").first();
    if (await response.isVisible()) await response.fill("A fossil is evidence of ancient life.");
    await page.getByRole("button", { name: "Complete mission" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete!" })).toBeVisible();
  });

  test("Siyana answers, chooses confidence, saves, resumes, and completes Junior Detective Maths", async ({ page }) => {
    await login(page, "siyana", "atlas123");
    await page.getByRole("article").filter({ hasText: "Junior Detective Maths" }).getByRole("button").click();
    for (let step = 0; step < 3; step += 1) await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("Your number").fill("7");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByLabel("I understand").check();
    await page.getByRole("button", { name: "Save and exit" }).click();
    await page.getByRole("article").filter({ hasText: "Junior Detective Maths" }).getByRole("button", { name: "Resume" }).click();
    await expect(page.getByLabel("I understand")).toBeChecked();
    await advanceToEnd(page);
    await page.getByRole("button", { name: "Complete mission" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete!" })).toBeVisible();
  });

  test("parent sees children separately and learner cannot enter parent workspace", async ({ page, request }) => {
    await login(page, "parent", "atlas-parent-123");
    await expect(page.getByRole("heading", { name: "Leago" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Siyana" })).toBeVisible();
    await expect(page.getByText(/Most recently completed: The Lost Fossil/)).toBeVisible();
    const loginResponse = await request.post("http://127.0.0.1:3001/auth/login", { data: { username: "leago", password: "atlas123" } });
    const { token } = await loginResponse.json();
    const denied = await request.get("http://127.0.0.1:3001/parents/parent-siyana/summary", { headers: { authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
  });
});
