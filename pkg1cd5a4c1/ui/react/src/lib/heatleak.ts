/*
 * HeatLeak AI — frontend data layer.
 *
 * Thin, typed wrappers over the C3 backend (via c3Action / c3MemberAction /
 * c3CreateAction) plus shared enums and formatting helpers. Every record the UI
 * shows comes through here from the C3 types — there is no local mock data.
 */
import { c3Action, c3CreateAction, c3MemberAction } from '@/c3Action';
import type { DetectedRegion, ThermalPalette } from '@/lib/thermalAnalysis';

/* ----------------------------- Types ---------------------------------- */

export interface Meta {
  created?: string;
  updated?: string;
}

export interface Building {
  id: string;
  name: string;
  buildingType?: BuildingType;
  location?: string;
  description?: string;
  isDemo?: boolean;
  inspections?: ThermalInspection[];
  meta?: Meta;
}

export interface ThermalAnomaly {
  id: string;
  anomalyIndex: number;
  category: string;
  polarity: 'hot' | 'cold';
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
  relativeIntensity: number;
  areaPct: number;
  locationLabel: string;
  observation: string;
  possibleCauses: string;
  alternativeExplanations: string;
  verificationStep: string;
  priority: Priority;
  /** 'manual' when the inspector drew the region; absent/'auto' for pixel detection. */
  source?: 'auto' | 'manual';
  inspectorNote?: string;
}

export interface ThermalInspection {
  id: string;
  name: string;
  building?: { id: string; name?: string };
  buildingName?: string;
  buildingType?: BuildingType;
  inspectionDate?: string;
  status?: InspectionStatus;
  notes?: string;
  indoorTempC?: number;
  outdoorTempC?: number;
  originalImage?: string;
  annotatedImage?: string;
  palette?: ThermalPalette;
  imageWidth?: number;
  imageHeight?: number;
  summary?: string;
  priority?: Priority;
  anomalyCount?: number;
  analyzed?: boolean;
  isDemo?: boolean;
  anomalies?: ThermalAnomaly[];
  meta?: Meta;
}

export interface RepairScenario {
  id: string;
  name: string;
  interventionType?: string;
  repairCost?: number;
  annualEnergySavingsKwh?: number;
  electricityPricePerKwh?: number;
  emissionsFactorKgPerKwh?: number;
  meta?: Meta;
}

export interface RepairScenarioResult {
  annualCostSavings: number;
  simplePaybackYears: number | null;
  annualEmissionsReductionKg: number;
}

/* ----------------------------- Enums ----------------------------------- */

export type BuildingType = 'Residential' | 'Commercial' | 'Industrial' | 'Institutional';
export type InspectionStatus = 'Needs Review' | 'Under Investigation' | 'Verified' | 'Resolved';
export type Priority = 'Low' | 'Medium' | 'High';

export const BUILDING_TYPES: BuildingType[] = ['Residential', 'Commercial', 'Industrial', 'Institutional'];
export const INSPECTION_STATUSES: InspectionStatus[] = [
  'Needs Review',
  'Under Investigation',
  'Verified',
  'Resolved',
];
export const PRIORITIES: Priority[] = ['Low', 'Medium', 'High'];
export const ANOMALY_CATEGORIES = [
  'Window-frame thermal contrast',
  'Possible thermal bridging',
  'Door-seal irregularity',
  'Wall/ceiling temperature pattern',
  'Ambiguous thermal pattern',
];
export const INTERVENTIONS = [
  'Window weatherstripping',
  'Door seal replacement',
  'Window repair',
  'Insulation assessment',
  'Thermal bridging investigation',
];

/**
 * The hypothetical intervention most closely matching a finding's category, used
 * to prefill the Impact Simulator. A suggestion for comparison, not a diagnosis.
 */
export function interventionForCategory(category?: string): string {
  switch (category) {
    case 'Window-frame thermal contrast':
      return 'Window weatherstripping';
    case 'Door-seal irregularity':
      return 'Door seal replacement';
    case 'Possible thermal bridging':
      return 'Thermal bridging investigation';
    default:
      return 'Insulation assessment';
  }
}

/* -------------------------- Fetch spec types --------------------------- */

interface FetchResponse<T> {
  objs?: T[];
  count?: number;
}

const INSPECTION_INCLUDE =
  'this, building.id, building.name, anomalies.this';

/* ----------------------------- Buildings ------------------------------- */

export async function fetchBuildings(): Promise<Building[]> {
  const res = (await c3Action('Building', 'fetch', {
    include: 'this, inspections.id, inspections.status, inspections.analyzed',
    limit: 200,
    order: 'descending(meta.created)',
  })) as FetchResponse<Building>;
  return res.objs ?? [];
}

export async function createBuilding(input: {
  name: string;
  buildingType?: BuildingType;
  location?: string;
  description?: string;
}): Promise<Building> {
  return (await c3CreateAction('Building', 'create', {
    name: input.name,
    buildingType: input.buildingType,
    location: input.location,
    description: input.description,
    isDemo: false,
  })) as Building;
}

export async function removeBuilding(id: string): Promise<void> {
  await c3MemberAction('Building', 'remove', { id });
}

/**
 * Find a building by exact name, creating it if it does not yet exist. Used so an
 * inspection always links to a Building record.
 */
export async function ensureBuilding(
  name: string,
  buildingType?: BuildingType,
): Promise<Building> {
  const res = (await c3Action('Building', 'fetch', {
    filter: `name == '${name.replace(/'/g, "\\'")}'`,
    include: 'this',
    limit: 1,
  })) as FetchResponse<Building>;
  if (res.objs && res.objs.length > 0) return res.objs[0];
  return createBuilding({ name, buildingType });
}

/* --------------------------- Inspections ------------------------------- */

export async function fetchInspections(filter?: string): Promise<ThermalInspection[]> {
  const spec: Record<string, unknown> = {
    include: 'this, building.id, building.name',
    limit: 200,
    order: 'descending(inspectionDate)',
  };
  if (filter) spec.filter = filter;
  const res = (await c3Action('ThermalInspection', 'fetch', spec)) as FetchResponse<ThermalInspection>;
  return res.objs ?? [];
}

export async function fetchInspection(id: string): Promise<ThermalInspection | null> {
  const res = (await c3Action('ThermalInspection', 'fetch', {
    filter: `id == '${id}'`,
    include: INSPECTION_INCLUDE,
    limit: 1,
  })) as FetchResponse<ThermalInspection>;
  return res.objs && res.objs.length ? res.objs[0] : null;
}

export interface CreateInspectionInput {
  /** Optional stable id; when provided the record is upserted (idempotent demo data). */
  id?: string;
  name: string;
  buildingId: string;
  buildingName: string;
  buildingType?: BuildingType;
  notes?: string;
  indoorTempC?: number;
  outdoorTempC?: number;
  originalImage: string;
  annotatedImage: string;
  palette?: ThermalPalette;
  imageWidth: number;
  imageHeight: number;
  isDemo?: boolean;
}

export async function createInspection(input: CreateInspectionInput): Promise<ThermalInspection> {
  const action = input.id ? 'upsert' : 'create';
  return (await c3CreateAction('ThermalInspection', action, {
    ...(input.id ? { id: input.id } : {}),
    name: input.name,
    building: { id: input.buildingId },
    buildingName: input.buildingName,
    buildingType: input.buildingType,
    inspectionDate: new Date().toISOString(),
    status: 'Needs Review',
    notes: input.notes,
    indoorTempC: input.indoorTempC,
    outdoorTempC: input.outdoorTempC,
    originalImage: input.originalImage,
    annotatedImage: input.annotatedImage,
    palette: input.palette ?? 'auto',
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    analyzed: false,
    isDemo: !!input.isDemo,
  })) as ThermalInspection;
}

/** Run the backend AI analysis for an inspection, returning it with anomalies. */
export async function analyzeInspection(
  id: string,
  regionsJson: string,
): Promise<ThermalInspection> {
  return (await c3MemberAction('ThermalInspection', 'analyze', { id }, [regionsJson])) as ThermalInspection;
}

/**
 * Ask the AI to interpret one inspector-drawn region (already measured from the
 * image pixels). The backend appends it as a 'manual' anomaly.
 */
export async function interpretRegion(
  inspectionId: string,
  region: DetectedRegion & { inspectorNote?: string },
): Promise<ThermalAnomaly> {
  return (await c3MemberAction('ThermalInspection', 'interpretRegion', { id: inspectionId }, [
    JSON.stringify(region),
  ])) as ThermalAnomaly;
}

/** Remove one anomaly; the backend renumbers the rest and updates the count. */
export async function removeAnomaly(inspectionId: string, anomalyId: string): Promise<ThermalInspection> {
  return (await c3MemberAction('ThermalInspection', 'removeAnomaly', { id: inspectionId }, [
    anomalyId,
  ])) as ThermalInspection;
}

export type AnomalyEdit = Partial<
  Pick<
    ThermalAnomaly,
    | 'category'
    | 'priority'
    | 'observation'
    | 'possibleCauses'
    | 'alternativeExplanations'
    | 'verificationStep'
    | 'inspectorNote'
  >
>;

/** Save inspector edits to an anomaly's text fields. */
export async function updateAnomaly(id: string, edit: AnomalyEdit): Promise<void> {
  await c3CreateAction('ThermalAnomaly', 'merge', { id, ...edit });
}

/** Persist a re-rendered annotated image after findings change. */
export async function updateAnnotatedImage(id: string, annotatedImage: string): Promise<void> {
  await c3CreateAction('ThermalInspection', 'merge', { id, annotatedImage });
}

export async function updateInspectionStatus(id: string, status: InspectionStatus): Promise<void> {
  await c3CreateAction('ThermalInspection', 'merge', { id, status });
}

/** Fetch every anomaly across all inspections — used for dashboard breakdowns. */
export async function fetchAnomalies(): Promise<ThermalAnomaly[]> {
  const res = (await c3Action('ThermalAnomaly', 'fetch', {
    include: 'this',
    limit: 2000,
  })) as FetchResponse<ThermalAnomaly>;
  return res.objs ?? [];
}

export async function removeInspection(id: string): Promise<void> {
  await c3MemberAction('ThermalInspection', 'remove', { id });
}

/* ----------------------------- Scenarios ------------------------------- */

export async function computeScenario(
  repairCost: number,
  annualEnergySavingsKwh: number,
  electricityPricePerKwh: number,
  emissionsFactorKgPerKwh: number,
): Promise<RepairScenarioResult> {
  return (await c3Action('RepairScenario', 'computeScenario', [
    repairCost,
    annualEnergySavingsKwh,
    electricityPricePerKwh,
    emissionsFactorKgPerKwh,
  ])) as RepairScenarioResult;
}

export async function fetchScenarios(): Promise<RepairScenario[]> {
  const res = (await c3Action('RepairScenario', 'fetch', {
    include: 'this',
    limit: 100,
    order: 'descending(meta.created)',
  })) as FetchResponse<RepairScenario>;
  return res.objs ?? [];
}

export async function saveScenario(input: Omit<RepairScenario, 'id' | 'meta'>): Promise<RepairScenario> {
  return (await c3CreateAction('RepairScenario', 'create', input)) as RepairScenario;
}

export async function removeScenario(id: string): Promise<void> {
  await c3MemberAction('RepairScenario', 'remove', { id });
}

/* ----------------------------- Helpers --------------------------------- */

export function formatDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatCurrency(n: number): string {
  return n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
}

export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export type Appearance = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'danger' | 'info';

export function statusAppearance(status?: string): Appearance {
  switch (status) {
    case 'Needs Review':
      return 'warning';
    case 'Under Investigation':
      return 'info';
    case 'Verified':
      return 'accent';
    case 'Resolved':
      return 'success';
    default:
      return 'secondary';
  }
}

export function priorityAppearance(priority?: string): Appearance {
  switch (priority) {
    case 'High':
      return 'danger';
    case 'Medium':
      return 'warning';
    case 'Low':
      return 'success';
    default:
      return 'secondary';
  }
}

/** Does a status count as still needing follow-up? */
export function needsFollowUp(status?: string): boolean {
  return status === 'Needs Review' || status === 'Under Investigation';
}
