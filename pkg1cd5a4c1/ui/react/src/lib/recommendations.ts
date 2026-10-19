/*
 * HeatLeak AI — suggested next steps per finding category.
 *
 * Every number here is a typical published range, never a measurement from a
 * thermal image. Savings are anchored on the ENERGY STAR whole-house estimate
 * (air sealing + insulation saves an average of 15% on heating and cooling
 * costs) and split conservatively per intervention. Costs are rough installer
 * ranges and are labelled "rough" wherever they are shown.
 */

export interface Recommendation {
  /** One of INTERVENTIONS in heatleak.ts. */
  intervention: string;
  /** Rough installer range, USD. */
  typicalCostUsd: [number, number];
  /** Share of annual heating + cooling energy, in percent. [0, 0] = diagnostic only. */
  savingsPctOfHeatingCooling: [number, number];
  sourceLabel: string;
  sourceUrl: string;
  /** One line shown in the table. */
  note: string;
}

const ENERGY_STAR_METHODOLOGY = {
  sourceLabel: 'ENERGY STAR, Methodology for Estimated Energy Savings',
  sourceUrl: 'https://www.energystar.gov/saveathome/seal_insulate/methodology',
};

const ENERGY_STAR_WINDOW_DOOR = {
  sourceLabel: 'ENERGY STAR, Sealing Behind Window & Door Trim',
  sourceUrl: 'https://www.energystar.gov/saveathome/seal_insulate/sealing-window-door',
};

const ENERGY_STAR_INSPECTIONS = {
  sourceLabel: 'ENERGY STAR, DIY Checks & Inspections',
  sourceUrl: 'https://www.energystar.gov/saveathome/seal_insulate/identify-problems-you-want-fix/diy-checks-inspections',
};

const THERMAL_BRIDGING_INVESTIGATION: Recommendation = {
  intervention: 'Thermal bridging investigation',
  typicalCostUsd: [200, 600],
  savingsPctOfHeatingCooling: [0, 0],
  ...ENERGY_STAR_INSPECTIONS,
  note: 'Diagnostic only; savings depend on what is found',
};

/** Keyed on the five category strings in ANOMALY_CATEGORIES, exactly. */
export const RECOMMENDATIONS: Record<string, Recommendation[]> = {
  'Window-frame thermal contrast': [
    {
      intervention: 'Window weatherstripping',
      typicalCostUsd: [100, 400],
      savingsPctOfHeatingCooling: [2, 5],
      ...ENERGY_STAR_WINDOW_DOOR,
      note: "One window's share of whole-house air-sealing savings",
    },
    {
      intervention: 'Window repair',
      typicalCostUsd: [300, 1200],
      savingsPctOfHeatingCooling: [3, 8],
      ...ENERGY_STAR_METHODOLOGY,
      note: 'If seal or glazing failure is confirmed on site',
    },
  ],
  'Door-seal irregularity': [
    {
      intervention: 'Door seal replacement',
      typicalCostUsd: [50, 250],
      savingsPctOfHeatingCooling: [1, 4],
      ...ENERGY_STAR_WINDOW_DOOR,
      note: 'Per door',
    },
  ],
  'Possible thermal bridging': [THERMAL_BRIDGING_INVESTIGATION],
  'Wall/ceiling temperature pattern': [
    {
      intervention: 'Insulation assessment',
      typicalCostUsd: [1500, 5000],
      savingsPctOfHeatingCooling: [5, 15],
      ...ENERGY_STAR_METHODOLOGY,
      note: 'Upper bound is the ENERGY STAR whole-house figure',
    },
  ],
  'Ambiguous thermal pattern': [
    {
      ...THERMAL_BRIDGING_INVESTIGATION,
      note: 'Re-image under larger ΔT before spending',
    },
  ],
};

/** A recommendation together with the display numbers of the findings it covers. */
export interface SuggestedStep extends Recommendation {
  findingNumbers: number[];
}

/**
 * One step per distinct intervention across the given findings, in first-seen
 * order, listing the finding numbers each covers. Rejected findings are skipped.
 * `number` is the 1-based position shown on the image and in the report.
 */
export function suggestedSteps(
  findings: Array<{ category?: string; rejected?: boolean; number: number }>,
): SuggestedStep[] {
  const byIntervention = new Map<string, SuggestedStep>();
  for (const f of findings) {
    if (f.rejected) continue;
    for (const rec of RECOMMENDATIONS[f.category ?? ''] ?? []) {
      const existing = byIntervention.get(rec.intervention);
      if (existing) {
        if (!existing.findingNumbers.includes(f.number)) existing.findingNumbers.push(f.number);
      } else {
        byIntervention.set(rec.intervention, { ...rec, findingNumbers: [f.number] });
      }
    }
  }
  return [...byIntervention.values()];
}

export function midpoint([lo, hi]: [number, number]): number {
  return (lo + hi) / 2;
}

/** True for diagnostic-only rows (no savings range). */
export function isInvestigation(rec: Recommendation): boolean {
  return rec.savingsPctOfHeatingCooling[1] === 0;
}
