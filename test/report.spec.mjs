import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { runExperiment, processDriver } from "../dist/index.js";
import { renderSummary } from "../dist/report.js";
let server;
let base;
const directory = resolve(".cache/report-browser-test");
test.beforeAll(async () => {
  await mkdir(directory, { recursive: true });
  const runs = [];
  for (const variant of ["baseline", "broken", "fixed"])
    runs.push(
      await runExperiment({
        scenario: "booking",
        variant,
        driver: processDriver,
        output: directory,
      }),
    );
  await writeFile(join(directory, "index.html"), renderSummary(runs));
  await writeFile(join(directory, "summary.json"), JSON.stringify(runs));
  server = spawn(
    process.execPath,
    ["dist/cli.js", "serve", directory, "--port", "0"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  base = await new Promise((done, fail) => {
    server.stdout.on("data", (c) => {
      const match = String(c).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) done(match[0]);
    });
    server.on("error", fail);
    server.on("exit", (code) => fail(new Error(`Server exited ${code}`)));
  });
});
test.afterAll(async () => {
  if (server) {
    server.kill();
    await new Promise((r) => server.once("exit", r));
  }
});
test("summary and evidence report render, navigate and filter without overflow", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.goto(base);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "What survives",
  );
  await expect(page.getByText("FAIL", { exact: true })).toHaveCount(1);
  await page.screenshot({ path: ".cache/report-summary.png", fullPage: true });
  await page.getByRole("link", { name: "Follow the evidence" }).nth(1).click();
  await expect(
    page.getByRole("heading", { name: "One tap. One booking." }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "2", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Faults", exact: true }).click();
  await expect(page.locator(".event:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.screenshot({ path: ".cache/report-detail.png", fullPage: true });
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: ".cache/report-mobile.png", fullPage: true });
  expect(errors).toEqual([]);
});
