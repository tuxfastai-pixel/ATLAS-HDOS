import { expect } from "@playwright/test";

async function advanceToEnd(page) {
  const nextButton = page.getByRole("button", {
    name: "Next",
    exact: true
  });

  const completeButton = page.getByRole("button", {
    name: "Complete mission",
    exact: true
  });

  const stepIndicator = page.locator("#step-indicator");

  while (!(await completeButton.isVisible())) {
    const previousStep = await stepIndicator.textContent();

    await nextButton.click();

    await expect(stepIndicator).not.toHaveText(previousStep ?? "");
  }
}
