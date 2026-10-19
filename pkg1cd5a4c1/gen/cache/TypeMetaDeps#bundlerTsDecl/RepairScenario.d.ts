export interface RepairScenario {

  readonly id: string;
  withId(id: string): RepairScenario;

  readonly versionEdits?: C3.Array<VersionEdit | null>;
  withVersionEdits(versionEdits: C3.Array<VersionEdit | null> | Array<IVersionEdit | null>): RepairScenario;

  readonly name: string;
  withName(name: string): RepairScenario;

  readonly meta?: Meta | null;
  withMeta(meta: IMeta | null): RepairScenario;

  readonly version?: number | null;
  withVersion(version: number | null): RepairScenario;

  readonly typeWithBindings?: Type | null;
  withTypeWithBindings(typeWithBindings: IType | null): RepairScenario;

  readonly inspection?: ThermalInspection | null;
  withInspection(inspection: IThermalInspection | null): RepairScenario;

  readonly interventionType?: string | null;
  withInterventionType(interventionType: string | null): RepairScenario;

  readonly repairCost?: number | null;
  withRepairCost(repairCost: number | null): RepairScenario;

  readonly annualEnergySavingsKwh?: number | null;
  withAnnualEnergySavingsKwh(annualEnergySavingsKwh: number | null): RepairScenario;

  readonly electricityPricePerKwh?: number | null;
  withElectricityPricePerKwh(electricityPricePerKwh: number | null): RepairScenario;

  readonly emissionsFactorKgPerKwh?: number | null;
  withEmissionsFactorKgPerKwh(emissionsFactorKgPerKwh: number | null): RepairScenario;
}

