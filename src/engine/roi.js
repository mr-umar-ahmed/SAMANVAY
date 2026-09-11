/**
 * SAMANVAY Divisional ROI & Penalty Audit Engine.
 * Every line = a quantity taken from the plan (optimised or baseline) × an
 * editable unit assumption. No placeholder quantities: when the plan has
 * nothing to count (e.g. no goods train regulated), the line is zero.
 * Pure isomorphic ES module.
 */

export const DEFAULT_ROI_ASSUMPTIONS = {
  delayPerMinuteVb: 2500,        // ₹ / train-minute for premium paths (Vande Bharat, Rajdhani, Shatabdi)
  delayPerMinuteMailExp: 1200,   // ₹ / train-minute for other passenger trains
  delayPerMinuteGoods: 800,      // ₹ / train-minute for goods paths running under SLW
  lineHourOpportunity: 18000,    // ₹ / section-hour of line availability
  freightDemurragePerHour: 4500, // ₹ / rake-hour for goods regulated at a yard
  tsrEnergyPerTrainMin: 350,     // ₹ extra traction energy per train-minute lost to a TSR
  machineSetupPerBlock: 12000,   // ₹ mobilisation & setup cost per possession
  co2KgPerTsrMin: 0.9,           // kg CO2 per train-minute lost to a TSR
  carbonCreditPerTon: 1800       // ₹ per tonne CO2
};

const PREMIUM = new Set(['VB', 'RAJ', 'SHT']);

/** Train delay, split by who pays for it, from the blocks' affected-train lists. */
function delayBreakdown(blocks = []) {
  const out = { premiumMin: 0, passengerMin: 0, goodsSlwMin: 0, regulatedRakes: 0, regulatedMin: 0 };
  for (const b of blocks) {
    for (const t of b.affectedTrains || []) {
      const min = t.delayMin || 0;
      if (t.cls === 'GOODS') {
        if (t.mode === 'REGULATED') {
          out.regulatedRakes += 1;
          out.regulatedMin += min;
        } else out.goodsSlwMin += min;
      } else if (PREMIUM.has(t.cls)) out.premiumMin += min;
      else out.passengerMin += min;
    }
  }
  return out;
}

export function computeRoiModel(weeklyResult, corridor, assumptions = DEFAULT_ROI_ASSUMPTIONS) {
  const a = { ...DEFAULT_ROI_ASSUMPTIONS, ...assumptions };
  const ai = weeklyResult.kpis;
  const base = weeklyResult.baseKpis;
  const dAi = delayBreakdown(weeklyResult.ai && weeklyResult.ai.blocks);
  const dBase = delayBreakdown(weeklyResult.baseline && weeklyResult.baseline.blocks);

  // 1. Train delay — raw train-minutes priced by class
  const delayCost = (d) => d.premiumMin * a.delayPerMinuteVb + d.passengerMin * a.delayPerMinuteMailExp + d.goodsSlwMin * a.delayPerMinuteGoods;
  const baseDelayCost = delayCost(dBase);
  const aiDelayCost = delayCost(dAi);

  // 2. Line availability
  const baseLineCost = base.sectionLineHoursLost * a.lineHourOpportunity;
  const aiLineCost = ai.sectionLineHoursLost * a.lineHourOpportunity;

  // 3. Goods regulated at yards — rake-hours actually held in the plan
  const baseDemurrage = (dBase.regulatedMin / 60) * a.freightDemurragePerHour;
  const aiDemurrage = (dAi.regulatedMin / 60) * a.freightDemurragePerHour;

  // 4. Traction energy lost to speed restrictions
  const baseTsrEnergy = base.tsrTrainMinutes * a.tsrEnergyPerTrainMin;
  const aiTsrEnergy = ai.tsrTrainMinutes * a.tsrEnergyPerTrainMin;

  // 5. Mobilisation per possession
  const baseSetupCost = base.blockCount * a.machineSetupPerBlock;
  const aiSetupCost = ai.blockCount * a.machineSetupPerBlock;

  const co2KgSaved = Math.max(0, base.tsrTrainMinutes - ai.tsrTrainMinutes) * a.co2KgPerTsrMin;
  const carbonRupees = (co2KgSaved / 1000) * a.carbonCreditPerTon;

  const line = (category, description, baselineRupees, aiRupees, metricText, quantities) => ({
    category,
    description,
    baselineRupees,
    aiRupees,
    savingsRupees: baselineRupees - aiRupees,
    metricText,
    quantities
  });

  const r = (v) => Math.round(v);
  const lineItems = [
    line(
      'Punctuality & Delay Penalties',
      'Train-minutes lost to blocks, priced by train class',
      baseDelayCost,
      aiDelayCost,
      `premium ${r(dBase.premiumMin)} → ${r(dAi.premiumMin)} min · passenger ${r(dBase.passengerMin)} → ${r(dAi.passengerMin)} min · goods ${r(dBase.goodsSlwMin)} → ${r(dAi.goodsSlwMin)} min`,
      { baseline: dBase, plan: dAi }
    ),
    line(
      'Corridor Line Capacity',
      'Section-line hours returned to traffic',
      baseLineCost,
      aiLineCost,
      `${base.sectionLineHoursLost.toFixed(1)} h → ${ai.sectionLineHoursLost.toFixed(1)} h lost`,
      { baseline: base.sectionLineHoursLost, plan: ai.sectionLineHoursLost }
    ),
    line(
      'Freight Turnaround & Demurrage',
      'Goods rakes regulated at a yard while a block is on',
      baseDemurrage,
      aiDemurrage,
      `${dBase.regulatedRakes} rakes (${(dBase.regulatedMin / 60).toFixed(1)} h) → ${dAi.regulatedRakes} rakes (${(dAi.regulatedMin / 60).toFixed(1)} h)`,
      { baseline: dBase.regulatedMin, plan: dAi.regulatedMin }
    ),
    line(
      'Traction Energy & Fuel',
      'Braking and re-acceleration through speed restrictions',
      baseTsrEnergy,
      aiTsrEnergy,
      `${Math.round(base.tsrTrainMinutes)} → ${Math.round(ai.tsrTrainMinutes)} TSR train-minutes (${base.tsrDays} → ${ai.tsrDays} task-days)`,
      { baseline: base.tsrTrainMinutes, plan: ai.tsrTrainMinutes }
    ),
    line(
      'Machine & Gang Mobilization',
      'One setup per possession — co-located works share it',
      baseSetupCost,
      aiSetupCost,
      `${base.blockCount} → ${ai.blockCount} possessions (${ai.coLocatedBlocks} co-located)`,
      { baseline: base.blockCount, plan: ai.blockCount }
    )
  ];

  const totalBaselineRupees = lineItems.reduce((acc, item) => acc + item.baselineRupees, 0);
  const totalAiRupees = lineItems.reduce((acc, item) => acc + item.aiRupees, 0);
  const totalSavingsRupees = lineItems.reduce((acc, item) => acc + item.savingsRupees, 0) + carbonRupees;

  return {
    lineItems,
    totalBaselineRupees,
    totalAiRupees,
    totalSavingsRupees,
    annualisedSavingsRupees: totalSavingsRupees * 52,
    co2KgSaved,
    carbonRupees,
    assumptions: a,
    corridorId: corridor ? corridor.id : null
  };
}
