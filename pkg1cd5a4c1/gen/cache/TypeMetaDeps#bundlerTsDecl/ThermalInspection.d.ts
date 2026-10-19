export interface ThermalInspection {

  readonly id: string;
  withId(id: string): ThermalInspection;

  readonly versionEdits?: C3.Array<VersionEdit | null>;
  withVersionEdits(versionEdits: C3.Array<VersionEdit | null> | Array<IVersionEdit | null>): ThermalInspection;

  readonly name: string;
  withName(name: string): ThermalInspection;

  readonly meta?: Meta | null;
  withMeta(meta: IMeta | null): ThermalInspection;

  readonly version?: number | null;
  withVersion(version: number | null): ThermalInspection;

  readonly typeWithBindings?: Type | null;
  withTypeWithBindings(typeWithBindings: IType | null): ThermalInspection;

  readonly building?: Building | null;
  withBuilding(building: IBuilding | null): ThermalInspection;

  readonly buildingName?: string | null;
  withBuildingName(buildingName: string | null): ThermalInspection;

  readonly buildingType?: string | null;
  withBuildingType(buildingType: string | null): ThermalInspection;

  readonly inspectionDate?: DateTime | null;
  withInspectionDate(inspectionDate: DateTime | Date | string | null): ThermalInspection;

  readonly status?: string | null;
  withStatus(status: string | null): ThermalInspection;

  readonly notes?: string | null;
  withNotes(notes: string | null): ThermalInspection;

  readonly indoorTempC?: number | null;
  withIndoorTempC(indoorTempC: number | null): ThermalInspection;

  readonly outdoorTempC?: number | null;
  withOutdoorTempC(outdoorTempC: number | null): ThermalInspection;

  readonly originalImage?: string | null;
  withOriginalImage(originalImage: string | null): ThermalInspection;

  readonly annotatedImage?: string | null;
  withAnnotatedImage(annotatedImage: string | null): ThermalInspection;

  readonly imageWidth?: number | null;
  withImageWidth(imageWidth: number | null): ThermalInspection;

  readonly imageHeight?: number | null;
  withImageHeight(imageHeight: number | null): ThermalInspection;

  readonly summary?: string | null;
  withSummary(summary: string | null): ThermalInspection;

  readonly priority?: string | null;
  withPriority(priority: string | null): ThermalInspection;

  readonly anomalyCount?: number | null;
  withAnomalyCount(anomalyCount: number | null): ThermalInspection;

  readonly analyzed?: boolean;
  withAnalyzed(analyzed: boolean): ThermalInspection;

  readonly isDemo?: boolean;
  withIsDemo(isDemo: boolean): ThermalInspection;

  readonly anomalies?: C3.Array<ThermalAnomaly | null>;
  withAnomalies(anomalies: C3.Array<ThermalAnomaly | null> | Array<IThermalAnomaly | null>): ThermalInspection;
}

