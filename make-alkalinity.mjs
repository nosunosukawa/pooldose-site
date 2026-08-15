#!/usr/bin/env node
/**
 * make-alkalinity.mjs — 記事 baking-soda-alkalinity.html の数値部分を生成する。
 *
 * 数値は**アプリと同じ投薬エンジン（poolchem.js）を実行して**作る（手打ちしない）。
 * 使い方: node make-alkalinity.mjs
 *   baking-soda-alkalinity.html の <!-- data:start --> 〜 <!-- data:end --> を書き換える。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(here, "poolchem.js"), "utf8"), ctx);
const { computeDose, formatDryAmount } = ctx.PoolChem;

const GALLONS = [5000, 10000, 15000, 20000, 25000];
const DELTAS = [10, 20, 30];

const fmt = (oz) => {
  const f = formatDryAmount(oz, "us");
  const p = `${f.primary.value} ${f.primary.unit}`;
  return f.secondary ? `${p} ${f.secondary.value} ${f.secondary.unit}` : p;
};

const rows = DELTAS.map((d) => {
  const cells = GALLONS.map((gal) => {
    const dose = computeDose("ta", 60, 60 + d, { gallons: gal }, "baking_soda");
    const split = dose.splits.length > 1 ? ` <span class="split">&times;${dose.splits.length}</span>` : "";
    return `<td>${fmt(dose.totalOz)}${split}</td>`;
  }).join("");
  return `        <tr><th scope="row">+${d} ppm</th>${cells}</tr>`;
}).join("\n");

// 「重曹 vs ソーダ灰」の節で使う数字もエンジンから:
// pH 7.0→7.4（TA80・CYA30・10,000ガロン）をソーダ灰で上げたときの TA 副作用
const sodaAsh = computeDose("ph", 7.0, 7.4, { gallons: 10000, ta: 80, cya: 30 }, "soda_ash");
const ex = computeDose("ta", 60, 70, { gallons: 10000 }, "baking_soda");
const retestH = Math.round(ex.retestAfterMinutes / 60);

const block = `<!-- data:start（node make-alkalinity.mjs が生成。手で直さない） -->
  <div class="scroll">
    <table>
      <thead>
        <tr><th>Raise TA by</th><th>5,000 gal</th><th>10,000 gal</th><th>15,000 gal</th>
            <th>20,000 gal</th><th>25,000 gal</th></tr>
      </thead>
      <tbody>
${rows}
      </tbody>
    </table>
  </div>
  <p class="hint">Swipe the table sideways for larger pools &rarr;</p>
  <p class="muted">Amounts are baking soda (sodium bicarbonate) by <em>weight</em>.
     <span class="split">&times;2</span> / <span class="split">&times;3</span> = too much
     for a single addition — split the total into that many doses, brushing away any
     piles between additions. Retest after about ${retestH} hours; alkalinity readings
     drift while the water mixes.</p>

  <p style="margin-top:16px">Example: to lift a 10,000-gallon pool from 60 to 70 ppm,
     add <strong>${fmt(ex.totalOz)}</strong> of plain baking soda. The 1-lb boxes from the
     grocery store are the same sodium bicarbonate as "alkalinity increaser" —
     the pool-store label mostly buys a bigger bucket.</p>

  <h2>Baking soda vs soda ash — which one do you need?</h2>
  <div class="card">
    <div class="pad accent"></div>
    <div class="body">
      <p>They look alike and both nudge both numbers, but they are different tools:
         <strong>baking soda raises alkalinity</strong> with only a small pH effect;
         <strong>soda ash raises pH</strong> — and drags TA up with it as a side effect.</p>
      <p>The engine puts a number on that side effect: raising pH 7.0&nbsp;&rarr;&nbsp;7.4
         in a 10,000-gallon pool takes about <strong>${fmt(sodaAsh.totalOz)}</strong> of
         soda ash and adds roughly <strong>${sodaAsh.sideEffects.ta ?? 0} ppm of TA</strong>
         at the same time. So the order matters: if <em>both</em> pH and TA are low,
         fix pH with soda ash first, retest, and only then top up TA with baking soda —
         otherwise you overshoot alkalinity and end up lowering it again with acid.</p>
      <p class="muted">Lowering TA is the opposite, asymmetric job: acid plus aeration,
         done in rounds. There is no "alkalinity decreaser" powder that skips the rounds.</p>
    </div>
  </div>
  <!-- data:end -->`;

const PAGE = join(here, "baking-soda-alkalinity.html");
const page = readFileSync(PAGE, "utf8");
const next = page.replace(/<!-- data:start[\s\S]*?<!-- data:end -->/, block);
if (next === page && !page.includes("data:start"))
  throw new Error("baking-soda-alkalinity.html にマーカーが無い");
writeFileSync(PAGE, next);
console.log(
  `更新した: +10ppm@10k gal = ${fmt(ex.totalOz)} / ソーダ灰の TA 副作用 ${sodaAsh.sideEffects.ta} ppm`
);
