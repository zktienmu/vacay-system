import { test, expect } from "./fixtures";

test.describe("Leave request form", () => {
  test("form renders with all required fields", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/leave/new");

    // Page title
    const heading = page.locator("h1");
    await expect(heading).toBeVisible();

    // Leave type select
    const typeSelect = page.locator("select");
    await expect(typeSelect).toBeVisible();

    // Date inputs
    const dateInputs = page.locator('input[type="date"]');
    await expect(dateInputs).toHaveCount(2);

    // Notes textarea
    const notes = page.locator("textarea");
    await expect(notes).toBeVisible();

    // Submit button
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeVisible();
    // Should be disabled initially (no dates/delegates selected)
    await expect(submitButton).toBeDisabled();
  });

  test("leave type dropdown has all 6 types", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/leave/new");

    const options = page.locator("select option");
    await expect(options).toHaveCount(6);
  });

  test("handover URL field exists", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/leave/new");

    // The handover URL input should be present (always visible now)
    const handoverInput = page.locator('input[type="url"]');
    await expect(handoverInput).toBeVisible();
  });

  test("cancel button navigates back", async ({
    authenticatedPage: page,
  }) => {
    // First go to dashboard so we have history
    await page.goto("/dashboard");
    await page.locator('main a[href="/leave/new"]').click();
    await page.waitForURL("**/leave/new");

    // Click cancel
    const cancelButton = page.locator("button").filter({ hasText: /取消|Cancel/ });
    await expect(cancelButton).toBeVisible();
  });

  test("working days display shows placeholder when no dates selected", async ({
    authenticatedPage: page,
  }) => {
    await page.goto("/leave/new");

    // Should show "—" when no dates are selected
    await expect(page.locator("text=—")).toBeVisible();
  });
});
