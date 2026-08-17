#!/usr/bin/env node
/**
 * verify-engine.mjs — 同梱エンジン(poolchem.js) と アプリ本体のソースが**同じ答えを出す**ことを検算する。
 *
 * 生成し忘れ・手編集・アプリ側の改修に置いていかれた状態を、ここで落とす。
 * （2026-08-17: 公開中の電卓が Cal-Hypo 48% のカルシウム蓄積を26%少なく出していた。
 *   同梱エンジンが sideEffectScale 導入前のリビジョンのままだったため。検算が無かったので誰も気づけなかった）
 *
 *   node verify-engine.mjs      → 全一致なら緑で「合格」、1件でも違えば赤で落ちる(exit 1)
 *
 * 比較のやり方: アプリ本体の src/chemistry を**その場で別ビルド**して読み込み、
 * 同梱の poolchem.js と総当たりで突き合わせる。同梱物を自分自身と比べても意味がないので、
 * 必ず「アプリのソースから作った側」と比べること。
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const APP_SRC = join(here, "../../mobile/pooldose/src/chemistry");
const TMP = join(here, ".engine-tmp");

if (!existsSync(APP_SRC)) {
  console.error(`\x1b[31m✗ アプリ本体のソースが無い: ${APP_SRC}\x1b[0m`);
  process.exit(1);
}
const esbuild = join(here, "node_modules/.bin/esbuild");
if (!existsSync(esbuild)) {
  console.error("\x1b[31m✗ esbuild が無い。npm install を先に。\x1b[0m");
  process.exit(1);
}

/* --- 1) 同梱エンジン（公開されている実物） --- */
const bundled = (() => {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(here, "poolchem.js"), "utf8"), ctx);
  return ctx.PoolChem;
})();

/* --- 2) アプリ本体のソースから、その場で作り直した参照実装 --- */
rmSync(TMP, { recursive: true, force: true });
mkdirSync(TMP, { recursive: true });
const refPath = join(TMP, "ref.mjs");
execFileSync(esbuild, [
  join(here, "poolchem-entry.ts"),
  "--bundle",
  "--format=esm",
  "--target=es2018",
  "--log-level=error",
  `--outfile=${refPath}`,
], { stdio: ["ignore", "ignore", "inherit"] });
const ref = await import(pathToFileURL(refPath).href);

/* --- 3) 総当たり --- */
const failures = [];
let checks = 0;
const call = (fn) => {
  try {
    return { ok: JSON.stringify(fn()) };
  } catch (e) {
    return { ok: "throw:" + (e.code ?? e.message) };
  }
};
const same = (label, fn) => {
  checks++;
  const a = call(() => fn(bundled));
  const b = call(() => fn(ref));
  if (a.ok !== b.ok) failures.push({ label, bundled: a.ok, source: b.ok });
};

/* 薬剤定義そのもの */
for (const id of Object.keys(ref.CHEMICALS)) same(`CHEMICALS.${id}`, (E) => E.CHEMICALS[id]);
same("CHEMICALS のキー一覧", (E) => Object.keys(E.CHEMICALS).sort());

/* 換算定数 */
for (const k of [
  "LITERS_PER_GALLON", "GALLONS_PER_LITER", "GRAMS_PER_OUNCE", "OUNCES_PER_POUND",
  "ML_PER_FL_OUNCE", "FL_OUNCES_PER_GALLON", "FL_OUNCES_PER_CUP", "FEET_PER_METER",
  "GRAMS_PER_PPM_PER_10K_GAL", "GALLONS_PER_CUBIC_FOOT",
]) same(`定数 ${k}`, (E) => E[k]);

/* 線形パラメータの投薬量。プール容量 × 薬剤 × 製品濃度 × 現在値/目標値 の格子 */
const GALLONS = [200, 350, 500, 1000, 5000, 10000, 15000, 20000, 25000, 40000, 100000];
const CONC = {
  liquid_chlorine: [5, 6, 8.25, 10, 12.5],
  cal_hypo: [48, 53, 65, 73],
  muriatic_acid: [14.5, 20, 28, 31.45],
};
const LINEAR = [
  ["fc", ["liquid_chlorine", "cal_hypo", "dichlor", "trichlor"], [0, 1, 2.5], [1, 3, 5, 10, 20]],
  ["ta", ["baking_soda"], [40, 60, 80], [70, 90, 110, 140]],
  ["ch", ["calcium_chloride", "calcium_chloride_dihydrate"], [80, 150, 250], [200, 300, 450]],
  ["cya", ["cyanuric_acid"], [0, 20, 45], [30, 50, 80]],
  ["salt", ["pool_salt"], [0, 1200, 2800], [3000, 3400, 4000]],
  ["bromine", ["bcdmh_granules", "sodium_bromide"], [0, 1, 3], [2, 4, 8]],
];
for (const [param, chems, currents, targets] of LINEAR)
  for (const chem of chems)
    for (const gal of GALLONS)
      for (const cur of currents)
        for (const tgt of targets)
          for (const pct of CONC[chem] ?? [undefined])
            same(
              `computeDose ${param} ${chem} ${gal}gal ${cur}→${tgt} ${pct ?? "既定"}%`,
              (E) => E.computeDose(param, cur, tgt, { gallons: gal }, chem,
                pct ? { concentrationPercent: pct } : undefined)
            );

/* pH（炭酸＋シアヌル酸バッファ）。TA と CYA でバッファの効きが変わるので両方振る */
for (const chem of ["muriatic_acid", "dry_acid", "soda_ash", "borax"])
  for (const gal of [350, 10000, 25000])
    for (const [cur, tgt] of [[7.8, 7.5], [8.2, 7.4], [7.0, 7.4], [6.9, 7.6], [7.5, 7.2]])
      for (const ta of [40, 80, 120, 200])
        for (const cya of [0, 30, 50, 100])
          for (const pct of CONC[chem] ?? [undefined])
            same(
              `computeDose ph ${chem} ${gal}gal ${cur}→${tgt} TA${ta} CYA${cya} ${pct ?? "既定"}%`,
              (E) => E.computeDose("ph", cur, tgt, { gallons: gal, ta, cya }, chem,
                pct ? { concentrationPercent: pct } : undefined)
            );

/* 入力が壊れている場合も同じ落ち方をすること（エラーコードまで比べる） */
for (const [param, cur, tgt, chem] of [
  ["fc", 5, 5, "liquid_chlorine"], ["fc", 5, 1, "liquid_chlorine"],
  ["ph", 7.4, 7.4, "soda_ash"], ["ph", 5.0, 7.4, "muriatic_acid"],
  ["ph", 7.0, 9.9, "soda_ash"], ["ta", 60, 80, "cal_hypo"],
])
  same(`エラー ${param} ${chem} ${cur}→${tgt}`, (E) =>
    E.computeDose(param, cur, tgt, { gallons: 10000 }, chem));
same("エラー 容量0", (E) => E.computeDose("fc", 1, 3, { gallons: 0 }, "liquid_chlorine"));
same("エラー 未対応の薬剤", (E) => E.computeDose("fc", 1, 3, { gallons: 100 }, "nope"));

/* TA下げ（酸）。pH副作用を出す/出さないの分岐も踏む */
for (const chem of ["muriatic_acid", "dry_acid"])
  for (const gal of [500, 10000, 30000])
    for (const delta of [10, 30, 60])
      for (const opts of [undefined, { currentPh: 7.8, currentTa: 120 }, { currentPh: 7.4, currentTa: 90, cya: 50 }, { currentTa: 100 }])
        same(`computeTaLowerDose ${chem} ${gal}gal -${delta}ppm ${JSON.stringify(opts)}`,
          (E) => E.computeTaLowerDose(delta, gal, chem, opts));

/* 表示用の分解。しきい値(1カップ=8 fl oz / 1ポンド=16 oz)の両側を必ず踏む */
for (const oz of [0, 0.004, 0.05, 0.5, 0.99, 1, 1.5, 7.9, 8, 8.1, 15.9, 16, 16.1, 31.9, 32, 127, 128, 128.1, 500, 2000])
  for (const sys of ["us", "metric"]) {
    same(`formatDryAmount ${oz} ${sys}`, (E) => E.formatDryAmount(oz, sys));
    same(`formatLiquidAmount ${oz} ${sys}`, (E) => E.formatLiquidAmount(oz, sys));
  }
for (const v of [0, 0.5, 1, 3.7, 100, 1000, 12345.678]) {
  same(`litersToGallons ${v}`, (E) => E.litersToGallons(v));
  same(`gallonsToLiters ${v}`, (E) => E.gallonsToLiters(v));
  same(`ozToGrams ${v}`, (E) => E.ozToGrams(v));
  same(`flOzToMl ${v}`, (E) => E.flOzToMl(v));
  same(`round ${v}`, (E) => [E.round(v, 0), E.round(v, 1), E.round(v, 2)]);
  same(`roundDose ${v}`, (E) => E.roundDose(v));
  same(`toFeet ${v}`, (E) => [E.toFeet(v, "ft"), E.toFeet(v, "m")]);
  same(`dryOzForPpm ${v}`, (E) => E.dryOzForPpm(1, 10000, v || 1));
  same(`liquidFlOzForPpm ${v}`, (E) => E.liquidFlOzForPpm(1, 10000, v || 1));
}

/* 形状 → 容量 */
for (const shape of [
  { kind: "rectangle", lengthFt: 32, widthFt: 16, shallowFt: 3, deepFt: 8 },
  { kind: "rectangle", lengthFt: 6, widthFt: 6, shallowFt: 3, deepFt: 3 },
  { kind: "circle", diameterFt: 18, shallowFt: 4, deepFt: 4 },
  { kind: "oval", lengthFt: 30, widthFt: 15, shallowFt: 3.5, deepFt: 6 },
  { kind: "kidney", lengthFt: 28, widthAFt: 12, widthBFt: 16, shallowFt: 3, deepFt: 7 },
  { kind: "custom", gallons: 350 },
]) same(`computeGallons ${shape.kind}`, (E) => E.computeGallons(shape));

/* pH の内部関数（記事の副作用値の出どころ） */
for (const ph1 of [7.0, 7.4, 7.8, 8.2])
  for (const ph2 of [7.2, 7.4, 7.6])
    for (const ta of [60, 100, 160])
      for (const cya of [0, 40, 90]) {
        same(`acidEquivalentsPerLiter ${ph1}→${ph2} TA${ta} CYA${cya}`,
          (E) => E.acidEquivalentsPerLiter(ph1, ph2, ta, cya));
        same(`phAfterAcid ${ph1} TA${ta} CYA${cya}`,
          (E) => E.phAfterAcid(ph1, ta, cya, 0.0005));
      }

rmSync(TMP, { recursive: true, force: true });

/* --- 4) 判定 --- */
const header = readFileSync(join(here, "poolchem.js"), "utf8").slice(0, 400);
if (!header.includes("生成物") || !header.includes("build-engine.sh")) {
  failures.push({
    label: "poolchem.js の先頭",
    bundled: "生成物であることの注記が無い",
    source: "build-engine.sh で作り直すこと",
  });
}

if (failures.length) {
  console.error(`\x1b[31m✗ 不一致 ${failures.length} 件 / ${checks} 件中\x1b[0m`);
  for (const f of failures.slice(0, 20)) {
    console.error(`\x1b[31m  [${f.label}]\x1b[0m`);
    console.error(`    同梱 poolchem.js : ${f.bundled}`);
    console.error(`    アプリ本体のソース: ${f.source}`);
  }
  if (failures.length > 20) console.error(`  …ほか ${failures.length - 20} 件`);
  console.error("\n  直し方: ./build-engine.sh で作り直し、記事の生成も回す");
  console.error("          node make-alkalinity.mjs && node make-dosage.mjs");
  process.exit(1);
}
console.log(`\x1b[32m✓ 合格: ${checks} 件すべて一致（同梱 poolchem.js == mobile/pooldose/src/chemistry）\x1b[0m`);
