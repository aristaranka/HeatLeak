/*
 * HeatLeak AI — RepairScenario.evaluate
 *
 * Pure arithmetic on user-provided assumptions. These are hypothetical planning
 * figures and are never derived from a thermal image.
 */
function computeScenario(repairCost, annualEnergySavingsKwh, electricityPricePerKwh, emissionsFactorKgPerKwh) {
  var savingsKwh = annualEnergySavingsKwh || 0;
  var price = electricityPricePerKwh || 0;
  var factor = emissionsFactorKgPerKwh || 0;
  var cost = repairCost || 0;

  var annualCostSavings = savingsKwh * price;
  var simplePaybackYears = annualCostSavings > 0 ? (cost / annualCostSavings) : null;
  var annualEmissionsReductionKg = savingsKwh * factor;

  return RepairScenarioResult.make({
    annualCostSavings: annualCostSavings,
    simplePaybackYears: simplePaybackYears,
    annualEmissionsReductionKg: annualEmissionsReductionKg,
  });
}
