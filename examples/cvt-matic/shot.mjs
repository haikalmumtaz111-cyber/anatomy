// Stills of the video page at chosen times, for checking: node shot.mjs out-dir t1 t2 ...
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { join, resolve } from "node:path";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "/opt/node22/lib/node_modules/playwright");
const [out, ...times] = process.argv.slice(2);
const page_ = process.env.PAGE || "cvt-matic-video.html";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console", m.text()));
await page.goto(pathToFileURL(resolve(page_)).href);
await page.waitForFunction(() => window.__frame);
for (const t of times) {
  await page.evaluate((t) => window.__frame(t), Number(t));
  await page.screenshot({ path: join(out, `t${t}.png`) });
  console.log("shot", t);
}
await browser.close();
