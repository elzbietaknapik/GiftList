import { test, expect } from "@playwright/test";

// Seed test — wzorzec dla generowanych testów E2E
// Chroni bramkę autoryzacji: niezalogowany użytkownik wchodzący na / trafia na /login
test.use({ storageState: { cookies: [], origins: [] } });

test("unauthenticated visit to / is gated by sign-in", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL("**/login");
    await expect(page).toHaveURL(/.*\/login/);
});