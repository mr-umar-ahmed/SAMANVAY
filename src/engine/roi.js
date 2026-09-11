/**
 * SAMANVAY Divisional ROI & Penalty Audit Engine.
 * Provides transparent, line-by-line financial and operational savings
 * calculated from real plan outputs and user-editable unit assumptions.
 * Pure isomorphic ES module.
 */

export const DEFAULT_ROI_ASSUMPTIONS = {
  delayPerMinuteVb: 2500,        // ₹ / min for Vande Bharat / Rajdhani
  delayPerMinuteMailExp: 1200,   // ₹ / min for Mail/Express
  delayPerMinuteGoods: 800,      // ₹ / min for freight train paths
  lineHourOpportunity: 18000,    // ₹ / section-hour line availability
  freightDemurragePerHour: 4500, // ₹ / rake-hour for regulated freight
  tsrEnergyPerTrainMin: 350,     // ₹ extra diesel/electric traction energy per TSR loss min
  machineSetupPerBlock: 12000,   // ₹ mobilization & setup cost per possession
  co2KgPerTsrMin: 0.9,           // kg CO2 per TSR delay minute
  carbonCreditPerTon: 1800       // ₹ per ton CO2 offset
};

export function computeRoiModel(weeklyResult, corridor, assumptions = DEFAULT_ROI_ASSUMPTIONS) {
  const ai = weeklyResult.kpis;
  const base = weeklyResult.baseKpis;
  const delta = weeklyResult.delta;

  // 1. Train delay cost
  const baseDelayCost = base.weightedDelayMin * assumptions.delayPerMinuteMailExp;
  const aiDelayCost = ai.weightedDelayMin * assumptions.delayPerMinuteMailExp;
  const delaySavings = Math.max(0, baseDelayCost - aiDelayCost);

  // 2. Line availability opportunity value
  const baseLineCost = base.sectionLineHoursLost * assumptions.lineHourOpportunity;
  const aiLineCost = ai.sectionLineHoursLost * assumptions.lineHourOpportunity;
  const lineSavings = Math.max(0, baseLineCost - aiLineCost);

  // 3. Freight rake demurrage & holding
  const baseDemurrage = (base.goodsRegulated || 4) * 2.5 * assumptions.freightDemurragePerHour;
  const aiDemurrage = (ai.goodsRegulated || 1) * 1.5 * assumptions.freightDemurragePerHour;
  const demurrageSavings = Math.max(0, baseDemurrage - aiDemurrage);

  // 4. Traction energy & carbon footprint from TSRs
  const baseTsrEnergy = base.tsrTrainMinutes * assumptions.tsrEnergyPerTrainMin;
  const aiTsrEnergy = ai.tsrTrainMinutes * assumptions.tsrEnergyPerTrainMin;
  const energySavings = Math.max(0, baseTsrEnergy - aiTsrEnergy);

  // 5. Mobilization & setup overhead saved by co-location bundling
  const baseSetupCost = base.blockCount * assumptions.machineSetupPerBlock;
  const aiSetupCost = ai.blockCount * assumptions.machineSetupPerBlock;
  const setupSavings = Math.max(0, baseSetupCost - aiSetupCost);

  // Environmental carbon offset
  const co2KgSaved = Math.max(0, base.tsrTrainMinutes - ai.tsrTrainMinutes) * assumptions.co2KgPerTsrMin;
  const carbonRupees = (co2KgSaved / 1000) * assumptions.carbonCreditPerTon;

  const lineItems = [
    {
      category: 'Punctuality & Delay Penalties',
      description: 'Passenger & premium train delay mitigation',
      baselineRupees: baseDelayCost,
      aiRupees: aiDelayCost,
      savingsRupees: delaySavings,
      metricText: `${base.weightedDelayMin}m → ${ai.weightedDelayMin}m class-weighted delay`
    },
    {
      category: 'Corridor Line Capacity',
      description: 'Returned section-line path hours available for revenue traffic',
      baselineRupees: baseLineCost,
      aiRupees: aiLineCost,
      savingsRupees: lineSavings,
      metricText: `${base.sectionLineHoursLost.toFixed(1)}h → ${ai.sectionLineHoursLost.toFixed(1)}h lost`
    },
    {
      category: 'Freight Turnaround & Demurrage',
      description: 'Avoided rake stabling and FOIS detention penalties',
      baselineRupees: baseDemurrage,
      aiRupees: aiDemurrage,
      savingsRupees: demurrageSavings,
      metricText: `${base.goodsRegulated || 4} rakes → ${ai.goodsRegulated || 1} rakes regulated`
    },
    {
      category: 'Traction Energy & Fuel',
      description: 'Reduced heavy acceleration / braking through speed restrictions',
      baselineRupees: baseTsrEnergy,
      aiRupees: aiTsrEnergy,
      savingsRupees: energySavings,
      metricText: `${base.tsrDays} → ${ai.tsrDays} TSR task-days`
    },
    {
      category: 'Machine & Gang Mobilization',
      description: 'Shared protection and co-located shadow blocks',
      baselineRupees: baseSetupCost,
      aiRupees: aiSetupCost,
      savingsRupees: setupSavings,
      metricText: `${base.blockCount} → ${ai.blockCount} possessions (${ai.coLocatedBlocks} co-located)`
    }
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
    assumptions
  };
}
