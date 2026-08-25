import { expect, test } from "@playwright/test";

async function login(page, username, password) {
  await page.goto("/");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function goNext(page) {
  await Promise.all([
    page.waitForResponse((response) =>
      response.url().includes("/attempts/") &&
      response.request().method() === "PATCH" &&
      response.ok()
    ),
    page.getByRole("button", { name: "Next", exact: true }).click()
  ]);
}

async function advanceToEnd(page) {
  const complete = page.getByRole("button", { name: "Complete mission", exact: true });

  while (!(await complete.isVisible())) {
    await goNext(page);
  }
}

test.describe.serial("Sprint 007 persisted browser journeys", () => {
  test("Leago saves, resumes at the correct step, and completes The Lost Fossil", async ({ page }) => {
    await login(page, "leago", "atlas123");
    await expect(page.getByRole("heading", { name: "Welcome, Leago" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recommended Next Mission" })).toBeVisible();
    await expect(page.getByText("Why this mission?")).toBeVisible();
    await page.getByRole("article").filter({ hasText: "The Lost Fossil" }).getByRole("button").click();
    await goNext(page);
    await page.getByRole("button", { name: "Save and exit" }).click();
    await page
      .getByRole("article")
      .filter({ hasText: "The Lost Fossil" })
      .getByRole("button", { name: "Resume", exact: true })
      .click();
    await expect(page.locator("#progress-area")).toBeVisible();
    await expect(page.locator("#step-indicator")).toContainText(
      "Step 2 of"
    );
    await advanceToEnd(page);
    const response = page.locator("textarea").first();
    if (await response.isVisible()) await response.fill("A fossil is evidence of ancient life.");
    await page.getByRole("button", { name: "Complete mission" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete!" })).toBeVisible();
    await expect(page.locator("#growth-dna-list")).toContainText(/problem solving|persistence/i);
  });

  test("Siyana answers, chooses confidence, saves, resumes, and completes Junior Detective Maths", async ({ page }) => {
    await login(page, "siyana", "atlas123");
    await page.getByRole("article").filter({ hasText: "Junior Detective Maths" }).getByRole("button").click();
    for (let step = 0; step < 3; step += 1) await goNext(page);
    await page.getByLabel("Your number").fill("7");
    await goNext(page);
    await page.locator("textarea").first().fill("Five plus two makes seven.");
    await goNext(page);
    await page.getByLabel("I understand").check();
    await page.getByRole("button", { name: "Save and exit" }).click();
    await page
      .getByRole("article")
      .filter({ hasText: "Junior Detective Maths" })
      .getByRole("button", { name: "Resume", exact: true })
      .click();
    await expect(page.locator("#progress-area")).toBeVisible();
    await expect(page.getByLabel("I understand")).toBeChecked();
    await advanceToEnd(page);
    await page.getByRole("button", { name: "Complete mission" }).click();
    await expect(page.getByRole("heading", { name: "Mission complete!" })).toBeVisible();
    await expect(page.locator("#growth-dna-list")).toContainText(/numeracy|persistence/i);
  });

  test("parent sees children separately and learner cannot enter parent workspace", async ({ page, request }) => {
    await login(page, "parent", "atlas-parent-123");
    await expect(page.getByRole("heading", { name: "Leago" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Siyana" })).toBeVisible();
    for (const learnerId of ["learner-leago", "learner-siyana"]) {
      const child = page.locator(`[data-learner-id="${learnerId}"]`);
      await expect(child).toHaveCount(1);
      await expect(child.getByRole("heading", { name: "Recommended next mission", exact: true })).toHaveCount(1);
      await expect(child.locator(".recommendation-reason")).toHaveCount(1);
      await expect(child.locator(".recommendation-reason")).not.toBeEmpty();
      await expect(child.locator(".supported-growth-areas")).toHaveCount(1);
      await expect(child.locator(".supported-growth-areas")).toContainText("Supported growth areas:");
    }
    await expect(page.getByText(/Most recently completed: The Lost Fossil/)).toBeVisible();
    await expect(page.getByText("Why Atlas is showing this:").first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText(/better than|worse than|sibling rank/i);
    const loginResponse = await request.post("http://127.0.0.1:3001/auth/login", { data: { username: "leago", password: "atlas123" } });
    const { token } = await loginResponse.json();
    const denied = await request.get("http://127.0.0.1:3001/parents/parent-siyana/summary", { headers: { authorization: `Bearer ${token}` } });
    expect(denied.status()).toBe(403);
  });
});
