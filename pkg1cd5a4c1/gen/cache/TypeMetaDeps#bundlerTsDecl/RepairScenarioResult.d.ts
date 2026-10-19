export interface RepairScenarioResult {

  readonly annualCostSavings?: number | null;
  withAnnualCostSavings(annualCostSavings: number | null): RepairScenarioResult;

  readonly simplePaybackYears?: number | null;
  withSimplePaybackYears(simplePaybackYears: number | null): RepairScenarioResult;

  readonly annualEmissionsReductionKg?: number | null;
  withAnnualEmissionsReductionKg(annualEmissionsReductionKg: number | null): RepairScenarioResult;
}

