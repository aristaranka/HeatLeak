export interface ThermalAnomaly {

  readonly id: string;
  withId(id: string): ThermalAnomaly;

  readonly versionEdits?: C3.Array<VersionEdit | null>;
  withVersionEdits(versionEdits: C3.Array<VersionEdit | null> | Array<IVersionEdit | null>): ThermalAnomaly;

  readonly name?: string | null;
  withName(name: string | null): ThermalAnomaly;

  readonly meta?: Meta | null;
  withMeta(meta: IMeta | null): ThermalAnomaly;

  readonly version?: number | null;
  withVersion(version: number | null): ThermalAnomaly;

  readonly typeWithBindings?: Type | null;
  withTypeWithBindings(typeWithBindings: IType | null): ThermalAnomaly;

  readonly inspection: ThermalInspection;
  withInspection(inspection: IThermalInspection): ThermalAnomaly;

  readonly anomalyIndex: number;
  withAnomalyIndex(anomalyIndex: number): ThermalAnomaly;

  readonly category: string;
  withCategory(category: string): ThermalAnomaly;

  readonly polarity: string;
  withPolarity(polarity: string): ThermalAnomaly;

  readonly xPct: number;
  withXPct(xPct: number): ThermalAnomaly;

  readonly yPct: number;
  withYPct(yPct: number): ThermalAnomaly;

  readonly wPct: number;
  withWPct(wPct: number): ThermalAnomaly;

  readonly hPct: number;
  withHPct(hPct: number): ThermalAnomaly;

  readonly relativeIntensity: number;
  withRelativeIntensity(relativeIntensity: number): ThermalAnomaly;

  readonly areaPct: number;
  withAreaPct(areaPct: number): ThermalAnomaly;

  readonly locationLabel: string;
  withLocationLabel(locationLabel: string): ThermalAnomaly;

  readonly observation: string;
  withObservation(observation: string): ThermalAnomaly;

  readonly possibleCauses: string;
  withPossibleCauses(possibleCauses: string): ThermalAnomaly;

  readonly alternativeExplanations: string;
  withAlternativeExplanations(alternativeExplanations: string): ThermalAnomaly;

  readonly verificationStep: string;
  withVerificationStep(verificationStep: string): ThermalAnomaly;

  readonly priority: string;
  withPriority(priority: string): ThermalAnomaly;
}

