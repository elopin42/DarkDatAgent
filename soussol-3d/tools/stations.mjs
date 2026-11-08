#!/usr/bin/env node
// stations.mjs : capture les quatre stations de la scène du hero au même ?s= (et au même ?t=), en 1440x900.
//   node soussol-3d/tools/stations.mjs <url> <dossier de sortie> <suffixe> [--dpr 1]
// Les ?s= sont calculés une fois depuis la hauteur de la page (le pin du hero couvre 0 à 100vh de scroll) et
// écrits dans stations.json, pour que l'avant et l'après soient pris exactement aux mêmes positions.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(HERE, "../../.front/tools/package.json"));
const { chromium } = require("playwright");
const [url, outDir, suffix] = process.argv.slice(2);
const dprI = process.argv.indexOf("--dpr");
const DPR = dprI > 0 ? +process.argv[dprI + 1] : 1;
const W = 1440, H = 900;
mkdirSync(outDir, { recursive: true });

// progression du pin du hero pour chaque station (hero.ts : travelling 0 à 0,7, verre 0,7 à 0,82, ambre 0,8 à 0,87)
const STATIONS = [
  { nom: "hero", p: 0 },
  { nom: "approche", p: 0.4 },
  { nom: "ecran", p: 0.68 },
  { nom: "traversee", p: 0.8 },
];
const metal = process.env.FRONT_NAVIGATEUR === "chromium-metal";
const browser = metal
  ? await chromium.launch({ args: ["--use-angle=metal", "--ignore-gpu-blocklist"] })
  : await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR });
const page = await ctx.newPage();
const log = [];
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") log.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => log.push("pageerror " + e.message));

const fichierS = join(outDir, "stations.json");
let table;
if (existsSync(fichierS)) table = JSON.parse(readFileSync(fichierS, "utf8"));
else {
  await page.goto(url + "?t=8000", { waitUntil: "load" });
  await page.waitForFunction(() => window.__frontReady === true, null, { timeout: 60000 });
  const hauteur = await page.evaluate(() => document.documentElement.scrollHeight);
  table = STATIONS.map((s) => ({ ...s, s: +((s.p * H) / (hauteur - H)).toFixed(5) }))
  writeFileSync(fichierS, JSON.stringify({ hauteur, stations: table }, null, 2));
  table = { hauteur, stations: table };
}
for (const st of table.stations) {
  await page.goto(`${url}?s=${st.s}&t=8000`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__frontReady === true, null, { timeout: 90000 });
  await page.waitForTimeout(metal ? 2500 : 7000)
  await page.screenshot({ path: join(outDir, `${st.nom}-${suffix}.png`) });
  if (st.nom === "hero" && process.argv.includes("--poster")) await page.locator("[data-scene]").screenshot({ path: join(outDir, "poster.png") });
  console.log(`${st.nom} s=${st.s} -> ${st.nom}-${suffix}.png`);
}
await browser.close();
if (log.length) console.log("console :\n  " + log.slice(0, 10).join("\n  "));
