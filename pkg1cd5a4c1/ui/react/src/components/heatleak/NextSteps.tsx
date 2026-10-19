import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import {
  computeScenario,
  fetchScenarios,
  formatCurrency,
  formatNumber,
  ReviewedAnomaly,
} from '@/lib/heatleak';
import { suggestedSteps, isInvestigation } from '@/lib/recommendations';

interface SavedRow {
  id: string;
  name: string;
  repairCost: number;
  paybackYears: number | null;
}

function range([lo, hi]: [number, number], fmt: (n: number) => string): string {
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}

/**
 * "Suggested next steps" for the inspection report: one row per distinct
 * intervention across the kept findings, with typical published cost and
 * savings ranges (never measured from the image), any scenarios already saved
 * against this inspection, and a link into the prefilled Impact Simulator.
 */
export default function NextSteps({
  anomalies,
  inspectionId,
}: {
  anomalies: ReviewedAnomaly[];
  inspectionId: string;
}) {
  const navigate = useNavigate();
  const [saved, setSaved] = useState<SavedRow[]>([]);

  // Finding numbers follow the report's numbered list: kept findings in anomalyIndex order.
  const steps = useMemo(() => {
    const kept = [...anomalies]
      .filter((a) => !a.rejected)
      .sort((a, b) => (a.anomalyIndex ?? 0) - (b.anomalyIndex ?? 0));
    return suggestedSteps(kept.map((a, i) => ({ category: a.category, number: i + 1 })));
  }, [anomalies]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const scenarios = await fetchScenarios({ inspectionId });
        const rows = await Promise.all(
          scenarios.map(async (s) => {
            const result = await computeScenario(
              s.repairCost ?? 0,
              s.annualEnergySavingsKwh ?? 0,
              s.electricityPricePerKwh ?? 0,
              s.emissionsFactorKgPerKwh ?? 0,
            );
            return { id: s.id, name: s.name, repairCost: s.repairCost ?? 0, paybackYears: result.simplePaybackYears };
          }),
        );
        if (!cancelled) setSaved(rows);
      } catch {
        // Saved scenarios are supplementary; the suggested steps still render.
        if (!cancelled) setSaved([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inspectionId]);

  const heading = (
    <h2 className="mb-2 text-c3-bold-heading-h6 text-[var(--c3-style-basic-fg-primary)]">Suggested next steps</h2>
  );

  if (steps.length === 0) {
    return (
      <div>
        {heading}
        <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
          No candidate findings to act on.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        {heading}
        <Table size="sm" className="text-c3-regular-body-p3">
          <TableHeader>
            <TableRow>
              <TableHead>Intervention</TableHead>
              <TableHead>Findings</TableHead>
              <TableHead className="text-right">Typical cost, USD (rough)</TableHead>
              <TableHead className="text-right">Typical savings</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((s) => (
              <TableRow key={s.intervention}>
                <TableCell>
                  <div className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">{s.intervention}</div>
                  <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{s.note}</div>
                </TableCell>
                <TableCell className="tabular-nums">{s.findingNumbers.map((n) => `#${n}`).join(', ')}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {range(s.typicalCostUsd, (n) => formatNumber(n))}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {isInvestigation(s) ? '—' : `${range(s.savingsPctOfHeatingCooling, (n) => `${n}`)}%`}
                </TableCell>
                <TableCell>
                  <a
                    href={s.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-c3-regular-label-l3 text-[var(--hl-cyan)] underline-offset-2 hover:underline"
                  >
                    {s.sourceLabel}
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="mt-1.5 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
          Typical ranges from published sources, not measured from this image. Savings apply to annual heating and
          cooling energy.
        </p>
      </div>

      {saved.length > 0 ? (
        <div>
          <h3 className="mb-1 text-c3-bold-label-l2 text-[var(--c3-style-basic-fg-primary)]">Saved scenarios</h3>
          <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)] text-c3-regular-body-p3">
            {saved.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="text-[var(--c3-style-basic-fg-primary)]">{s.name}</span>
                <span className="tabular-nums text-[var(--c3-style-basic-fg-secondary)]">
                  {formatCurrency(s.repairCost)} ·{' '}
                  {s.paybackYears != null ? `${formatNumber(s.paybackYears, 1)} yr payback` : 'payback —'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="hl-no-print">
        <Button
          variant="outline"
          appearance="secondary"
          leadingIcon={<Calculator className="size-4" />}
          onClick={() => navigate(`/simulator?inspection=${encodeURIComponent(inspectionId)}`)}
        >
          Model these in the Impact Simulator
        </Button>
      </div>
    </div>
  );
}
