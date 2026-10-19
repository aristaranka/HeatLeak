import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Plus, Trash2, Calculator, Save, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import {
  computeScenario,
  fetchInspection,
  fetchScenarios,
  saveScenario,
  removeScenario,
  formatCurrency,
  formatNumber,
  INTERVENTIONS,
  RepairScenarioResult,
  ReviewedAnomaly,
  ThermalInspection,
} from '@/lib/heatleak';
import { suggestedSteps, midpoint, isInvestigation } from '@/lib/recommendations';

interface Row {
  key: string;
  persistedId?: string;
  name: string;
  interventionType: string;
  repairCost: number;
  annualEnergySavingsKwh: number;
  electricityPricePerKwh: number;
  emissionsFactorKgPerKwh: number;
  result: RepairScenarioResult;
  /** Prefilled from an inspection's findings and not yet saved or edited. */
  prefilled?: boolean;
  /** Midpoint share of annual heating + cooling energy (0..1), so kWh follows the annual input. */
  savingsShare?: number;
}

const DEFAULT_ANNUAL_KWH = '8000';

const COLORS = ['#22d3ee', '#14b8a6', '#f59e0b', '#a3e635', '#ef4444'];

export default function Simulator() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Arriving from a finding's "Simulate a repair" link prefills the form;
  // arriving from a report (?inspection=<id>) prefills rows from its findings.
  const [params] = useSearchParams();
  const fromFinding = params.get('name');
  const inspectionId = params.get('inspection');
  const [inspection, setInspection] = useState<ThermalInspection | null>(null);
  const [annualKwh, setAnnualKwh] = useState(DEFAULT_ANNUAL_KWH);
  const requested = params.get('intervention');
  const [name, setName] = useState(fromFinding ?? '');
  const [intervention, setIntervention] = useState<string>(
    requested && INTERVENTIONS.includes(requested) ? requested : INTERVENTIONS[0],
  );
  const [repairCost, setRepairCost] = useState('450');
  const [savingsKwh, setSavingsKwh] = useState('1200');
  const [price, setPrice] = useState('0.16');
  const [emissions, setEmissions] = useState('0.40');

  useEffect(() => {
    (async () => {
      try {
        const saved = await fetchScenarios(inspectionId ? { inspectionId } : undefined);
        const computed = await Promise.all(
          saved.map(async (s) => {
            const result = await computeScenario(
              s.repairCost ?? 0,
              s.annualEnergySavingsKwh ?? 0,
              s.electricityPricePerKwh ?? 0,
              s.emissionsFactorKgPerKwh ?? 0,
            );
            const row: Row = {
              key: s.id,
              persistedId: s.id,
              name: s.name,
              interventionType: s.interventionType ?? '',
              repairCost: s.repairCost ?? 0,
              annualEnergySavingsKwh: s.annualEnergySavingsKwh ?? 0,
              electricityPricePerKwh: s.electricityPricePerKwh ?? 0,
              emissionsFactorKgPerKwh: s.emissionsFactorKgPerKwh ?? 0,
              result,
            };
            return row;
          }),
        );
        let prefilled: Row[] = [];
        if (inspectionId) {
          const insp = await fetchInspection(inspectionId);
          if (!insp) throw new Error(`Inspection ${inspectionId} not found.`);
          setInspection(insp);
          prefilled = await prefillFromFindings(insp, new Set(computed.map((r) => r.name)));
        }
        setRows([...computed, ...prefilled]);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load saved scenarios.');
      } finally {
        setLoading(false);
      }
    })();
    // Runs once per inspection in the URL; later edits to the form inputs must not re-prefill.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectionId]);

  /** One unsaved row per distinct recommended intervention across the kept findings. */
  const prefillFromFindings = async (insp: ThermalInspection, existingNames: Set<string>): Promise<Row[]> => {
    const kept = ([...(insp.anomalies ?? [])] as ReviewedAnomaly[])
      .filter((a) => !a.rejected)
      .sort((a, b) => (a.anomalyIndex ?? 0) - (b.anomalyIndex ?? 0));
    const steps = suggestedSteps(kept.map((a, i) => ({ category: a.category, number: i + 1 })));
    const kwh = Number(annualKwh) || 0;
    const inp = { electricityPricePerKwh: Number(price) || 0, emissionsFactorKgPerKwh: Number(emissions) || 0 };
    const rowsFor = steps
      .map((s) => {
        const nums = s.findingNumbers.map((n) => `#${n}`).join(', ');
        const share = isInvestigation(s) ? 0 : midpoint(s.savingsPctOfHeatingCooling) / 100;
        return {
          name: `${s.intervention} (${s.findingNumbers.length > 1 ? 'findings' : 'finding'} ${nums})`,
          interventionType: s.intervention,
          repairCost: midpoint(s.typicalCostUsd),
          annualEnergySavingsKwh: Math.round(kwh * share),
          savingsShare: share,
        };
      })
      .filter((r) => !existingNames.has(r.name));
    return Promise.all(
      rowsFor.map(async (r, i) => ({
        ...r,
        ...inp,
        key: `prefill-${i}-${r.interventionType}`,
        prefilled: true,
        result: await computeScenario(r.repairCost, r.annualEnergySavingsKwh, inp.electricityPricePerKwh, inp.emissionsFactorKgPerKwh),
      })),
    );
  };

  // Prefilled rows follow the annual heating + cooling input until they are saved or edited.
  useEffect(() => {
    const kwh = Number(annualKwh) || 0;
    let cancelled = false;
    (async () => {
      const targets = rows.filter(
        (r) => r.prefilled && r.savingsShare && Math.round(kwh * r.savingsShare) !== r.annualEnergySavingsKwh,
      );
      if (!targets.length) return;
      try {
        const updated = await Promise.all(
          targets.map(async (r) => {
            const annualEnergySavingsKwh = Math.round(kwh * (r.savingsShare ?? 0));
            const result = await computeScenario(
              r.repairCost,
              annualEnergySavingsKwh,
              r.electricityPricePerKwh,
              r.emissionsFactorKgPerKwh,
            );
            return { ...r, annualEnergySavingsKwh, result };
          }),
        );
        if (cancelled) return;
        const byKey = new Map(updated.map((r) => [r.key, r]));
        setRows((prev) => prev.map((r) => byKey.get(r.key) ?? r));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to recompute scenarios.');
      }
    })();
    return () => {
      cancelled = true;
    };
    // Only the annual input drives this; rows changing because of it must not retrigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [annualKwh]);

  const inspectionLink = inspectionId ? { inspection: { id: inspectionId } } : {};

  const buildInputs = () => ({
    repairCost: Number(repairCost) || 0,
    annualEnergySavingsKwh: Number(savingsKwh) || 0,
    electricityPricePerKwh: Number(price) || 0,
    emissionsFactorKgPerKwh: Number(emissions) || 0,
  });

  const handleAdd = async (persist: boolean) => {
    const label = name.trim() || intervention;
    setBusy(true);
    setError(null);
    try {
      const inp = buildInputs();
      const result = await computeScenario(
        inp.repairCost,
        inp.annualEnergySavingsKwh,
        inp.electricityPricePerKwh,
        inp.emissionsFactorKgPerKwh,
      );
      let persistedId: string | undefined;
      if (persist) {
        const saved = await saveScenario({
          name: label,
          interventionType: intervention,
          ...inp,
          ...inspectionLink,
        });
        persistedId = saved.id;
      }
      setRows((prev) => [
        ...prev,
        {
          key: persistedId ?? `local-${Date.now()}`,
          persistedId,
          name: label,
          interventionType: intervention,
          ...inp,
          result,
        },
      ]);
      setName('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to compute scenario.');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveRow = async (row: Row) => {
    setBusy(true);
    setError(null);
    try {
      const saved = await saveScenario({
        name: row.name,
        interventionType: row.interventionType,
        repairCost: row.repairCost,
        annualEnergySavingsKwh: row.annualEnergySavingsKwh,
        electricityPricePerKwh: row.electricityPricePerKwh,
        emissionsFactorKgPerKwh: row.emissionsFactorKgPerKwh,
        ...inspectionLink,
      });
      setRows((prev) =>
        prev.map((r) => (r.key === row.key ? { ...r, key: saved.id, persistedId: saved.id, prefilled: false } : r)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save scenario.');
    } finally {
      setBusy(false);
    }
  };

  /** Move an unsaved row into the form so its assumptions can be changed. */
  const handleEditRow = (row: Row) => {
    setName(row.name);
    if (INTERVENTIONS.includes(row.interventionType)) setIntervention(row.interventionType);
    setRepairCost(String(row.repairCost));
    setSavingsKwh(String(row.annualEnergySavingsKwh));
    setPrice(String(row.electricityPricePerKwh));
    setEmissions(String(row.emissionsFactorKgPerKwh));
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  const handleRemove = async (row: Row) => {
    if (row.persistedId) {
      try {
        await removeScenario(row.persistedId);
      } catch {
        /* keep going — still remove from view */
      }
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  // Rows without a payback (no positive savings, e.g. diagnostic investigations) stay in the table only.
  const chartData = rows.filter((r) => r.result.simplePaybackYears != null).map((r) => ({
    name: r.name.length > 16 ? `${r.name.slice(0, 15)}…` : r.name,
    'Annual savings ($)': Math.round(r.result.annualCostSavings),
    'CO₂ avoided (kg)': Math.round(r.result.annualEmissionsReductionKg),
  }));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading simulator" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
      <div>
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Energy impact simulator</h1>
        {inspectionId ? (
          <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-primary)]">
            Scenarios for {inspection?.buildingName || inspection?.name || 'this inspection'} ·{' '}
            <Link to={`/reports/${inspectionId}`} className="text-[var(--hl-cyan)] underline-offset-2 hover:underline">
              View report
            </Link>
          </p>
        ) : null}
        <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Hypothetical scenarios from your assumptions and published typical ranges. Nothing here is measured from a
          thermal image.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr]">
        {/* Input form */}
        <Card className="gap-4">
          <CardHeader>
            <CardTitle>Add a scenario</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s-annual" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Annual heating + cooling energy (kWh/yr)
              </label>
              <Input id="s-annual" type="number" value={annualKwh} onChange={(e) => setAnnualKwh(e.target.value)} />
              <span className="text-[10px] text-[var(--c3-style-basic-fg-secondary)]">
                Typical US home; edit for this building
              </span>
            </div>
            {fromFinding ? (
              <p className="rounded-[var(--c3-style-border-radius-4)] bg-[var(--hl-cyan-soft)] p-2 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-primary)]">
                Prefilled from <strong>{fromFinding}</strong>. Replace the cost and savings with your own estimates —
                a thermal image alone cannot tell you how much energy a repair will save.
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s-name" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Scenario name
              </label>
              <Input id="s-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Seal attic hatch" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s-int" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Intervention type
              </label>
              <Combobox
                id="s-int"
                value={intervention}
                onValueChange={(v) => v && setIntervention(v)}
                options={INTERVENTIONS.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s-cost" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Repair cost ($)
              </label>
              <Input id="s-cost" type="number" value={repairCost} onChange={(e) => setRepairCost(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="s-kwh" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Annual energy savings (kWh/yr)
              </label>
              <Input id="s-kwh" type="number" value={savingsKwh} onChange={(e) => setSavingsKwh(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-price" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  $ / kWh
                </label>
                <Input id="s-price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="s-emit" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                  kg CO₂ / kWh
                </label>
                <Input id="s-emit" type="number" step="0.01" value={emissions} onChange={(e) => setEmissions(e.target.value)} />
              </div>
            </div>
            {error ? (
              <div className="rounded-[var(--c3-style-border-radius-4)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-2.5 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
                {error}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Button className="flex-1" leadingIcon={<Plus className="size-4" />} onClick={() => handleAdd(false)} disabled={busy}>
                Compare
              </Button>
              <Button
                variant="outline"
                appearance="secondary"
                leadingIcon={<Save className="size-4" />}
                onClick={() => handleAdd(true)}
                disabled={busy}
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="flex flex-col gap-4">
          {rows.length === 0 ? (
            <Card className="items-center gap-3 py-12 text-center">
              <Calculator className="size-8 text-[var(--hl-cyan)]" aria-hidden />
              <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
                Add a scenario to see estimated savings, payback and avoided emissions.
              </p>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Comparison</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--c3-style-basic-border-border)" vertical={false} />
                      <XAxis dataKey="name" stroke="var(--c3-style-basic-fg-secondary)" fontSize={11} />
                      <YAxis stroke="var(--c3-style-basic-fg-secondary)" fontSize={11} />
                      <Tooltip cursor={{ fill: 'var(--c3-style-basic-bg-hover)' }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="Annual savings ($)" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="CO₂ avoided (kg)" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-c3-regular-body-p3">
                    <thead className="border-b border-[var(--c3-style-basic-border-border)] text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      <tr>
                        <th className="p-3">Scenario</th>
                        <th className="p-3 text-right">Cost</th>
                        <th className="p-3 text-right">Annual savings</th>
                        <th className="p-3 text-right">Payback</th>
                        <th className="p-3 text-right">CO₂ / yr</th>
                        <th className="p-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--c3-style-basic-border-border)]">
                      {rows.map((r, i) => (
                        <tr key={r.key} className="text-[var(--c3-style-basic-fg-primary)]">
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <span className="size-2.5 shrink-0 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                              <div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-c3-bold-body-p3">{r.name}</span>
                                  {r.prefilled ? (
                                    <Badge appearance="info" variant="soft" size="sm">
                                      from finding
                                    </Badge>
                                  ) : null}
                                </div>
                                <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                                  {r.interventionType}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(r.repairCost)}</td>
                          <td className="p-3 text-right tabular-nums">{formatCurrency(r.result.annualCostSavings)}</td>
                          <td className="p-3 text-right tabular-nums">
                            {r.result.simplePaybackYears != null
                              ? `${formatNumber(r.result.simplePaybackYears, 1)} yr`
                              : '—'}
                          </td>
                          <td className="p-3 text-right tabular-nums">
                            {formatNumber(r.result.annualEmissionsReductionKg)} kg
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex justify-end gap-1">
                              {!r.persistedId ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    appearance="secondary"
                                    size="icon-sm"
                                    aria-label={`Edit ${r.name}`}
                                    onClick={() => handleEditRow(r)}
                                    disabled={busy}
                                  >
                                    <Pencil className="size-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    appearance="secondary"
                                    size="icon-sm"
                                    aria-label={`Save ${r.name}`}
                                    onClick={() => handleSaveRow(r)}
                                    disabled={busy}
                                  >
                                    <Save className="size-4" />
                                  </Button>
                                </>
                              ) : null}
                              <Button
                                variant="ghost"
                                appearance="danger"
                                size="icon-sm"
                                aria-label={`Remove ${r.name}`}
                                onClick={() => handleRemove(r)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
