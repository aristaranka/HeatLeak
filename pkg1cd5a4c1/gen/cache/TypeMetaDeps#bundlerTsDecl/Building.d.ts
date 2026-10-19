export interface Building {

  readonly id: string;
  withId(id: string): Building;

  readonly versionEdits?: C3.Array<VersionEdit | null>;
  withVersionEdits(versionEdits: C3.Array<VersionEdit | null> | Array<IVersionEdit | null>): Building;

  readonly name: string;
  withName(name: string): Building;

  readonly meta?: Meta | null;
  withMeta(meta: IMeta | null): Building;

  readonly version?: number | null;
  withVersion(version: number | null): Building;

  readonly typeWithBindings?: Type | null;
  withTypeWithBindings(typeWithBindings: IType | null): Building;

  readonly buildingType?: string | null;
  withBuildingType(buildingType: string | null): Building;

  readonly location?: string | null;
  withLocation(location: string | null): Building;

  readonly description?: string | null;
  withDescription(description: string | null): Building;

  readonly isDemo?: boolean;
  withIsDemo(isDemo: boolean): Building;

  readonly inspections?: C3.Array<ThermalInspection | null>;
  withInspections(inspections: C3.Array<ThermalInspection | null> | Array<IThermalInspection | null>): Building;
}

