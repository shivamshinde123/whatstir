import { chromium } from "@playwright/test";
const [,, base, out] = process.argv;
const b = await chromium.launch();
for (const [scheme, w, h, name] of [["light", 1280, 860, "tm-light"], ["dark", 1280, 860, "tm-dark"], ["light", 390, 844, "tm-phone"]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, colorScheme: scheme });
  await p.goto(base + "/");
  await p.getByRole("link", { name: /^B2B/ }).first().waitFor();
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}.png`, fullPage: name === "tm-phone" });
}
await b.close();
