import { test, expect, capture, password, workspacePassword, signInFoodSafe, signInBtb } from "./fixtures";

test("sign-in retains failed entries, rejects external return paths and clears identity on sign-out", async ({ page }) => {
  await page.goto("/auth/sign-in?next=https%3A%2F%2Foutside.example");
  await page.getByLabel("Email", { exact: true }).fill("owner@workspace.test");
  await page.getByLabel("Password", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("email and password don't match");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("owner@workspace.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5101/dashboard");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5101\/auth\/sign-in(?:\?next=%2Fdashboard)?$/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await signInFoodSafe(page, "staff");
  await expect(page.getByRole("heading", { name: "A good shift starts here." })).toBeVisible();
  await expect(page.locator('#workspace-tools a[href="/admin/vault"]')).toHaveCount(0);
});

test("signup explains email confirmation and its callback establishes the workspace session", async ({ page, fixture }, info) => {
  await page.goto("/auth/sign-up?trial=1");
  await page.getByLabel("Your name").fill("Alex Test");
  await page.getByLabel("Restaurant name").fill("The Test Kitchen");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Work email").fill("owner@workspace.test");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Check your email", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/auth\/sign-up/);
  const signup = (await fixture.state()).requests.find((request) => request.path.endsWith("/signup"));
  expect(signup?.query.redirect_to).toBe("http://127.0.0.1:5101/auth/callback?next=%2Fdashboard");
  await capture(page, info, "signup-confirmation");
  await page.goto("/auth/callback?code=valid:owner&next=/dashboard");
  await expect(page).toHaveURL("http://127.0.0.1:5101/dashboard");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
});

test("password recovery reaches the update screen, validates confirmation and persists a new password", async ({ page, fixture }) => {
  await page.goto("/auth/reset-password");
  await page.getByLabel("Email", { exact: true }).fill("owner@workspace.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Reset link sent" })).toBeVisible();
  const recovery = (await fixture.state()).requests.find((request) => request.path.endsWith("/recover"));
  expect(recovery?.query.redirect_to).toBe("http://127.0.0.1:5101/auth/callback?flow=recovery");
  await page.goto("/auth/callback?code=valid:owner&flow=recovery");
  await expect(page).toHaveURL("http://127.0.0.1:5101/auth/update-password");
  const newPassword = "NewBrowserPassword!234";
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password", { exact: true }).fill("DifferentPassword!234");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByText("Enter the same password in both fields.")).toBeVisible();
  await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your password is updated" })).toBeVisible();
  const update = (await fixture.state()).requests.find((request) => request.path.endsWith("/user") && request.method === "PUT");
  expect(update?.body).toMatchObject({ password: newPassword });
  await page.getByRole("link", { name: "Open my workspace" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/^http:\/\/127\.0\.0\.1:5101\/auth\/sign-in(?:\?next=%2Fdashboard)?$/);
  await page.getByLabel("Email", { exact: true }).fill("owner@workspace.test");
  await page.getByLabel("Password", { exact: true }).fill(newPassword);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
});

test("expired confirmation and recovery links offer a usable next step", async ({ page }) => {
  await page.goto("/auth/callback?code=expired&flow=recovery");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("reset link is expired or incomplete");
  await page.getByRole("link", { name: "Request another reset link" }).click();
  await expect(page.getByRole("heading", { name: "Reset your password", exact: true })).toBeVisible();
  await page.goto("/auth/callback?code=expired");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("confirmation link couldn’t be verified");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeEnabled();
});

test("BTB backend login recovers old cookies and loads account shortcuts without login env settings", async ({ page, context }) => {
  await context.addCookies([{ name: "btb_session", value: "manager.btb-dev-session-token", url: "http://127.0.0.1:5101", httpOnly: true, sameSite: "Lax" }]);
  const response = await page.request.get("/api/btb/me");
  await expect(response).toBeOK();
  const info = await response.json();
  expect(info.authenticated).toBe(false);
  expect(info.passwordHint).toBeNull();
  expect(info.accounts).toHaveLength(5);
  expect(JSON.stringify(info)).not.toContain(workspacePassword);
  await signInBtb(page, "manager");
  await expect(page.getByRole("heading", { name: "Your restaurant, in focus." })).toBeVisible();
  await expect(page.locator('a[href="/between-the-buns/cleaning-schedule"]').first()).toBeVisible();
  const me = await page.request.get("/api/btb/me");
  await expect(me).toBeOK();
  expect(await me.json()).toMatchObject({ authenticated: true, role: "manager" });
});

test("BTB sign-in keeps its return path local and its sign-out preserves the FoodSafe session", async ({ page }) => {
  await signInFoodSafe(page, "owner");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
  await page.goto("/between-the-buns/login?next=%2Fdashboard");
  await page.getByLabel("Team email").fill("manager@btb.demo");
  await page.getByLabel("Workspace password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("email and password don’t match");
  await page.getByLabel("Workspace password", { exact: true }).fill(workspacePassword);
  await page.getByRole("button", { name: "Open my workspace" }).click();
  await expect(page).toHaveURL(/\/between-the-buns$/);
  await expect(page.getByRole("heading", { name: "Your restaurant, in focus." })).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/between-the-buns\/login$/);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Your business, at a glance." })).toBeVisible();
  await signInBtb(page, "staff", "/between-the-buns/checklists");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Opening & closing checks");
});
