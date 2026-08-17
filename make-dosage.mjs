#!/usr/bin/env node
/**
 * make-dosage.mjs — 記事 chlorine-dosage.html の数値部分を生成する。
 *
 * ここは以前**手打ちの表**だった。そして実際にずれていた:
 * 「Cal-hypo granules 73%」の行に65%品の数字が入っていた（2.1 oz/10,000gal。73%なら1.8 oz）。
 * 手で書いた数字は必ずいつか実装とずれるので、生成に寄せた。
 *
 * 使い方: ./build-engine.sh && node verify-engine.mjs && node make-dosage.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(join(here, "poolchem.js"), "utf8"), ctx);
const { computeDose, formatLiquidAmount, CHEMICALS } = ctx.PoolChem;

const GALLONS = [5000, 10000, 15000, 20000, 25000];
const PRODUCTS = [
  { label: "Liquid chlorine 10%", id: "liquid_chlorine", pct: 10 },
  { label: "Liquid chlorine 12.5%", id: "liquid_chlorine", pct: 12.5 },
  { label: "Cal-hypo granules 73%", id: "cal_hypo", pct: 73 },
  { label: "Cal-hypo granules 65%", id: "cal_hypo", pct: 65 },
  { label: "Dichlor granules 55.5%", id: "dichlor", pct: null },
];

const dose = (id, gal, pct, ppm = 1) =>
  computeDose("fc", 0, ppm, { gallons: gal }, id, pct ? { concentrationPercent: pct } : undefined);

const rows = PRODUCTS.map((p) => {
  const cells = GALLONS.map((gal) => {
    const r = dose(p.id, gal, p.pct);
    return `<td>${r.totalOz.toFixed(1)} ${r.form === "liquid" ? "fl oz" : "oz"}</td>`;
  }).join("");
  return `          <tr><td>${p.label}</td>${cells}</tr>`;
}).join("\n");

/* 本文の数字も全部エンジンから */
const perPpm125 = dose("liquid_chlorine", 15000, 12.5).totalOz;
const three = dose("liquid_chlorine", 15000, 12.5, 3);
const threeDisp = formatLiquidAmount(three.totalOz, "us");
const retest = CHEMICALS.liquid_chlorine.retestAfterMinutes;

const per = (id, pct) => dose(id, 10000, pct).sideEffects;
const dichlorCya = per("dichlor").cya;
const calHypo65 = per("cal_hypo", 65).ch;
const calHypo73 = per("cal_hypo", 73).ch;
const liquidSalt = per("liquid_chlorine", 10).salt;
const trichlorTa = per("trichlor").ta;
const monthCya = Math.round((dichlorCya * 3 * 30) / 10) * 10;
const spaRatio = Math.round(10000 / 400);

const block = `<!-- data:start（node make-dosage.mjs が生成。手で直さない） -->
      <div class="scroll">
      <table>
        <thead>
          <tr><th>Product</th><th>5,000 gal</th><th>10,000 gal</th><th>15,000 gal</th>
              <th>20,000 gal</th><th>25,000 gal</th></tr>
        </thead>
        <tbody>
${rows}
        </tbody>
      </table>
      </div>
      <p class="hint">Swipe the table sideways for larger pools &rarr;</p>
      <p class="muted" style="margin-top:12px">Dry products are ounces by <em>weight</em>;
         liquids are fluid ounces. Percentages are the strength printed on the bottle or
         bucket — check yours, because 10% and 12.5% liquid chlorine are both sold as
         "pool shock" and the dose differs by a quarter. Cal-hypo is sold at several
         strengths and the difference is real: ${dose("cal_hypo", 10000, 65).totalOz.toFixed(1)}&nbsp;oz of 65% does the same
         job as ${dose("cal_hypo", 10000, 73).totalOz.toFixed(1)}&nbsp;oz of 73%.</p>
    </div>
  </div>

  <h2>Using the chart</h2>
  <div class="card">
    <div class="pad ok"></div>
    <div class="body">
      <h3>Worked example</h3>
      <p>A 15,000 gallon pool tests at 1&nbsp;ppm free chlorine. You want 4&nbsp;ppm, so you
         need to raise it by 3&nbsp;ppm.</p>
      <p>From the chart, 12.5% liquid chlorine is ${perPpm125.toFixed(1)}&nbsp;fl oz per ppm.
         ${perPpm125.toFixed(1)} × 3 = <strong>about ${threeDisp.primary.value} fl oz</strong>, or ${
  threeDisp.secondary ? `${threeDisp.secondary.value} ${threeDisp.secondary.unit}s` : "a few cups"
}.</p>
      <p>Pour it slowly around the deep end with the pump running, then
         <strong>wait ${retest} minutes and retest</strong> before deciding you need more.
         Chlorine needs a full turnover to read accurately, and the most common way people
         overshoot is testing too early and adding twice.</p>
    </div>
  </div>

  <h2>What each product also adds</h2>
  <div class="card">
    <div class="pad low"></div>
    <div class="body">
      <h3>Nothing raises only chlorine</h3>
      <p>Every chlorine product brings something else with it. Over a season those
         extras accumulate, and they are the usual reason a pool that "tests fine" stops
         responding to chlorine at all.</p>
      <ul>
        <li><strong>Dichlor</strong> adds about <strong>${dichlorCya} ppm cyanuric acid</strong> for
            every 1 ppm of chlorine. Raise chlorine by 3 ppm daily for a month and you have
            added roughly ${monthCya} ppm of CYA — enough to lock up your chlorine. CYA does not
            evaporate or burn off; the only way down is draining and refilling.</li>
        <li><strong>Cal-hypo</strong> adds about <strong>${calHypo65} ppm calcium hardness</strong>
            per 1 ppm of chlorine at 65% strength — ${calHypo73} ppm if you buy the 73% product,
            because it takes less of it. In hard-water areas this is what eventually scales
            your heater and clouds the water.</li>
        <li><strong>Liquid chlorine</strong> adds about <strong>${liquidSalt} ppm salt</strong> per
            1 ppm of chlorine and nothing else. That is why it is the workhorse for
            routine dosing — but it loses strength on the shelf, so an old jug doses
            weaker than the label says.</li>
        <li><strong>Trichlor tablets</strong> add cyanuric acid too, and they are acidic —
            they pull pH down and take <strong>${Math.abs(trichlorTa)} ppm of alkalinity</strong>
            with every ppm of chlorine as they dissolve.</li>
      </ul>
      <p>The practical rule: use stabilized chlorine (dichlor, trichlor) to
         <em>establish</em> CYA early in the season, then switch to liquid chlorine or
         cal-hypo for day-to-day dosing once CYA is where you want it.</p>
    </div>
  </div>

  <h2>Hot tubs are not small pools</h2>
  <div class="card">
    <div class="pad accent"></div>
    <div class="body">
      <p>A 400 gallon spa needs roughly <strong>1/${spaRatio}th</strong> of the 10,000 gallon dose —
         well under a teaspoon of dichlor per ppm. At that scale a casual scoop is an
         enormous overdose, which is why spa water so often swings between "no chlorine"
         and "burns your eyes."</p>
      <p>Hot water also burns chlorine off far faster than a pool, so spas are dosed
         little and often rather than in weekly slugs.</p>
    </div>
  </div>
  <!-- data:end -->`;

const PAGE = join(here, "chlorine-dosage.html");
const page = readFileSync(PAGE, "utf8");
const next = page.replace(/<!-- data:start[\s\S]*?<!-- data:end -->/, block);
if (next === page && !page.includes("data:start"))
  throw new Error("chlorine-dosage.html にマーカーが無い");
writeFileSync(PAGE, next);
console.log(
  `更新した: cal-hypo 73% = ${dose("cal_hypo", 10000, 73).totalOz.toFixed(1)} oz / 65% = ${dose(
    "cal_hypo",
    10000,
    65
  ).totalOz.toFixed(1)} oz（10,000gal・+1ppm）`
);
