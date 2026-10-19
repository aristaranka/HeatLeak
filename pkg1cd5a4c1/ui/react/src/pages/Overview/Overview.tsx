import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ScanLine, AlertTriangle, Building2, ClipboardCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchInspectionsLight,
  fetchBuildings,
  fetchAnomaliesWithInspection,
  needsFollowUp,
  statusAppearance,
  priorityAppearance,
  priorityRank,
  formatDate,
  INSPECTION_STATUSES,
  ThermalInspection,
  Building,
  ThermalAnomaly,
  Priority,
} from '@/lib/heatleak';

const STATUS_COLORS: Record<string, string> = {
  'Needs Review': '#f59e0b',
  'Under Investigation': '#38bdf8',
  Verified: '#22d3ee',
  Resolved: '#22c55e',
};

interface MetricProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  caption: string;
  accent: string;
}

function Metric({ icon, label, value, caption, accent }: MetricProps) {
  return (
    <Card className="gap-2">
      <div className="flex items-center gap-2">
        <span
          className="flex size-8 items-center justify-center rounded-[var(--c3-style-border-radius-4)]"
          style={{ background: `${accent}22`, color: accent }}
        >
          {icon}
        </span>
        <span className="text-c3-regular-label-l2 text-[var(--c3-style-basic-fg-secondary)]">{label}</span>
      </div>
      <div className="text-c3-bold-heading-h3 tabular-nums text-[var(--c3-style-basic-fg-primary)]">{value}</div>
      <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">{caption}</div>
    </Card>
  );
}

/** One triage-queue row: a building with at least one inspection. */
interface QueueRow {
  key: string;
  buildingName: string;
  buildingType?: string;
  /** Non-rejected anomalies on inspections still open (Needs Review / Under Investigation). */
  openFindings: number;
  /** Highest priority across those open inspections; absent when nothing is open. */
  highestPriority?: Priority;
  lastInspected?: string;
  inspectionCount: number;
  latestInspectionId: string;
}

function time(iso?: string): number {
  const t = iso ? new Date(iso).getTime() : NaN;
  return isNaN(t) ? 0 : t;
}

export default function Overview() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<ThermalInspection[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [anomalies, setAnomalies] = useState<ThermalAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insp, bldg, anom] = await Promise.all([
        fetchInspectionsLight(),
        fetchBuildings(),
        fetchAnomaliesWithInspection(),
      ]);
      setInspections(insp);
      setBuildings(bldg);
      setAnomalies(anom);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const totalInspections = inspections.length;
    // anomalyCount counts kept (non-rejected) findings only.
    const totalAnomalies = inspections.reduce((s, i) => s + (i.anomalyCount ?? 0), 0);
    const inspectedBuildingIds = new Set(
      inspections.map((i) => i.building?.id).filter((x): x is string => Boolean(x)),
    );
    const followUp = inspections.filter((i) => needsFollowUp(i.status)).length;

    const statusDist = INSPECTION_STATUSES.map((s) => ({
      name: s,
      value: inspections.filter((i) => i.status === s).length,
    })).filter((d) => d.value > 0);

    const priorityDist = (['High', 'Medium', 'Low'] as const).map((p) => ({
      name: p,
      value: anomalies.filter((a) => !a.rejected && a.priority === p).length,
    }));

    return {
      totalInspections,
      totalAnomalies,
      buildingsInspected: inspectedBuildingIds.size,
      followUp,
      statusDist,
      priorityDist,
    };
  }, [inspections, anomalies]);

  // Buildings ranked by where a crew should go first: priority, then open findings, then recency.
  const queue = useMemo<QueueRow[]>(() => {
    const openInspectionIds = new Set(inspections.filter((i) => needsFollowUp(i.status)).map((i) => i.id));
    const openFindingsByInspection = new Map<string, number>();
    for (const a of anomalies) {
      const inspectionId = a.inspection?.id;
      if (!inspectionId || a.rejected || !openInspectionIds.has(inspectionId)) continue;
      openFindingsByInspection.set(inspectionId, (openFindingsByInspection.get(inspectionId) ?? 0) + 1);
    }

    const groups = new Map<string, ThermalInspection[]>();
    for (const i of inspections) {
      const key = i.building?.id ?? `name:${i.buildingName ?? i.name}`;
      const list = groups.get(key);
      if (list) list.push(i);
      else groups.set(key, [i]);
    }

    const rows: QueueRow[] = [];
    groups.forEach((list, key) => {
      const byDate = [...list].sort((a, b) => time(b.inspectionDate) - time(a.inspectionDate));
      const latest = byDate[0];
      const open = list.filter((i) => needsFollowUp(i.status));
      const highestPriority = open.reduce<Priority | undefined>(
        (best, i) => (priorityRank(i.priority) > priorityRank(best) ? i.priority : best),
        undefined,
      );
      rows.push({
        key,
        buildingName: latest.building?.name || latest.buildingName || latest.name,
        buildingType: byDate.find((i) => i.buildingType)?.buildingType,
        openFindings: open.reduce((s, i) => s + (openFindingsByInspection.get(i.id) ?? 0), 0),
        highestPriority,
        lastInspected: latest.inspectionDate,
        inspectionCount: list.length,
        latestInspectionId: latest.id,
      });
    });

    rows.sort(
      (a, b) =>
        priorityRank(b.highestPriority) - priorityRank(a.highestPriority) ||
        b.openFindings - a.openFindings ||
        time(b.lastInspected) - time(a.lastInspected),
    );
    return rows;
  }, [inspections, anomalies]);

  const recent = inspections.slice(0, 6);
  const hasData = inspections.length > 0;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading overview" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
      {/* Hero */}
      <div className="hl-hero flex flex-col gap-3 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-border)] p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-c3-bold-heading-h3 text-[var(--c3-style-basic-fg-primary)]">
              HeatLeak <span className="hl-accent-text">AI</span>
            </h1>
            <p className="mt-1 max-w-xl text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
              Intelligent thermal building diagnostics. See the energy you cannot see — upload an infrared image and
              screen it for insulation defects, air leakage and thermal bridging.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button leadingIcon={<ScanLine className="size-4" />} onClick={() => navigate('/inspections/new')}>
              New inspection
            </Button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-3 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
          {error}
        </div>
      ) : null}

      {!hasData ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Sparkles className="size-8 text-[var(--hl-cyan)]" aria-hidden />
          <CardTitle>No inspections yet</CardTitle>
          <CardContent className="max-w-md">Start one to populate the queue.</CardContent>
          <Button leadingIcon={<ScanLine className="size-4" />} onClick={() => navigate('/inspections/new')}>
            Start an inspection
          </Button>
        </Card>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={<ScanLine className="size-4" />}
              label="Total inspections"
              value={stats.totalInspections}
              caption="Thermal images analyzed"
              accent="#22d3ee"
            />
            <Metric
              icon={<AlertTriangle className="size-4" />}
              label="Thermal anomalies flagged"
              value={stats.totalAnomalies}
              caption="Candidate regions across all images"
              accent="#f59e0b"
            />
            <Metric
              icon={<Building2 className="size-4" />}
              label="Buildings inspected"
              value={stats.buildingsInspected}
              caption={`${buildings.length} building${buildings.length === 1 ? '' : 's'} on file`}
              accent="#14b8a6"
            />
            <Metric
              icon={<ClipboardCheck className="size-4" />}
              label="Requiring follow-up"
              value={stats.followUp}
              caption="Needs review or under investigation"
              accent="#ef4444"
            />
          </div>

          {/* Triage queue */}
          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Triage queue</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {queue.length === 0 ? (
                <p className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-secondary)]">
                  No inspections yet. Start one to populate the queue.
                </p>
              ) : (
                <Table size="sm" hover>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Building</TableHead>
                      <TableHead className="hidden md:table-cell">Type</TableHead>
                      <TableHead className="text-right">Open findings</TableHead>
                      <TableHead>Highest priority</TableHead>
                      <TableHead>Last inspected</TableHead>
                      <TableHead className="hidden text-right md:table-cell">Inspections</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queue.map((r) => (
                      <TableRow key={r.key}>
                        <TableCell>
                          <Link
                            to={`/analysis/${r.latestInspectionId}`}
                            className="text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)] hover:text-[var(--c3-style-basic-fg-accent)]"
                          >
                            {r.buildingName}
                          </Link>
                        </TableCell>
                        <TableCell className="hidden text-[var(--c3-style-basic-fg-secondary)] md:table-cell">
                          {r.buildingType ?? '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.openFindings}</TableCell>
                        <TableCell>
                          {r.highestPriority ? (
                            <Badge appearance={priorityAppearance(r.highestPriority)} variant="soft" size="sm">
                              {r.highestPriority}
                            </Badge>
                          ) : (
                            <span className="text-[var(--c3-style-basic-fg-secondary)]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-[var(--c3-style-basic-fg-secondary)]">{formatDate(r.lastInspected)}</TableCell>
                        <TableCell className="hidden text-right tabular-nums md:table-cell">{r.inspectionCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Charts + activity */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Status distribution</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                {stats.statusDist.length === 0 ? (
                  <p>No inspections to chart yet.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={stats.statusDist} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                        {stats.statusDist.map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#64748b'} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.statusDist.map((d) => (
                  <span key={d.name} className="flex items-center gap-1 text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    <span className="size-2 rounded-full" style={{ background: STATUS_COLORS[d.name] }} /> {d.name} ({d.value})
                  </span>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Anomaly priority breakdown</CardTitle>
              </CardHeader>
              <CardContent className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.priorityDist}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--c3-style-basic-border-border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--c3-style-basic-fg-secondary)" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="var(--c3-style-basic-fg-secondary)" fontSize={12} />
                    <Tooltip cursor={{ fill: 'var(--c3-style-basic-bg-hover)' }} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill="#ef4444" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#22c55e" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
              <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Priority is a qualitative screening signal, not a severity measurement.
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
                  {recent.map((i) => (
                    <li key={i.id}>
                      <Link
                        to={`/analysis/${i.id}`}
                        className="flex items-center gap-3 py-2.5 hover:text-[var(--c3-style-basic-fg-accent)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-c3-bold-body-p3 text-[var(--c3-style-basic-fg-primary)]">
                              {i.buildingName || i.name}
                            </span>
                            {i.isDemo ? <DemoBadge /> : null}
                          </div>
                          <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                            {formatDate(i.inspectionDate)} · {i.anomalyCount ?? 0} anomal
                            {(i.anomalyCount ?? 0) === 1 ? 'y' : 'ies'}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <Badge appearance={statusAppearance(i.status)} variant="soft" size="sm">
                            {i.status}
                          </Badge>
                          {i.explanationSource ? <span className="hl-tag">{i.explanationSource}</span> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
