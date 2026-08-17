/**
 * poolchem-entry.ts — poolchem.js（サイト同梱エンジン）の生成元エントリ。
 *
 * ここは**再輸出だけ**を書く。計算式・定数を1行でもここに書いたら、
 * 「アプリ本体が唯一の出典」という前提が崩れて、また手コピーの写し崩れが始まる。
 *
 * 生成元: ../../mobile/pooldose/src/chemistry/*.ts
 * 生成:   ./build-engine.sh   →  poolchem.js
 * 検算:   node verify-engine.mjs（同梱エンジン vs アプリ本体のソースを総当たりで突き合わせる）
 */

export {
  CHEMICALS,
  dryOzForPpm,
  liquidFlOzForPpm,
  type ChemicalDef,
  type ChemicalId,
  type Param,
} from "../../mobile/pooldose/src/chemistry/chemicals";

export {
  DoseError,
  computeDose,
  computeTaLowerDose,
  acidEquivalentsPerLiter,
  phAfterAcid,
  type DoseResult,
  type DoseSplit,
  type PoolContext,
} from "../../mobile/pooldose/src/chemistry/dosing";

export {
  LITERS_PER_GALLON,
  GALLONS_PER_LITER,
  GRAMS_PER_OUNCE,
  OUNCES_PER_POUND,
  ML_PER_FL_OUNCE,
  FL_OUNCES_PER_GALLON,
  FL_OUNCES_PER_CUP,
  FEET_PER_METER,
  GRAMS_PER_PPM_PER_10K_GAL,
  litersToGallons,
  gallonsToLiters,
  toFeet,
  ozToGrams,
  flOzToMl,
  formatDryAmount,
  formatLiquidAmount,
  round,
  roundDose,
} from "../../mobile/pooldose/src/chemistry/units";

export { GALLONS_PER_CUBIC_FOOT, computeGallons } from "../../mobile/pooldose/src/chemistry/volume";
