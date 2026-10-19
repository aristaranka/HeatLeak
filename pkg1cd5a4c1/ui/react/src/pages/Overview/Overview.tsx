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
import { ScanLine, AlertTriangle, Building2, ClipboardCheck, FlaskConical, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import CautionNotice from '@/components/heatleak/CautionNotice';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchInspections,
  fetchBuildings,
  fetchAnomalies,
  needsFollowUp,
  statusAppearance,
  formatDate,
  INSPECTION_STATUSES,
  ThermalInspection,
  Building,
  ThermalAnomaly,
} from '@/lib/heatleak';
import { loadDemoData, DemoProgress } from '@/lib/thermalDemo';

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

export default function Overview() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<ThermalInspection[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [anomalies, setAnomalies] = useState<ThermalAnomaly[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoProgress, setDemoProgress] = useState<DemoProgress | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [insp, bldg, anom] = await Promise.all([fetchInspections(), fetchBuildings(), fetchAnomalies()]);
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

  const handleLoadDemo = async () => {
    setDemoBusy(true);
    setError(null);
    try {
      await loadDemoData((p) => setDemoProgress(p));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate demonstration data.');
    } finally {
      setDemoBusy(false);
      setDemoProgress(null);
    }
  };

  const stats = useMemo(() => {
    const totalInspections = inspections.length;
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
      value: anomalies.filter((a) => a.priority === p).length,
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
            <Button
              variant="outline"
              appearance="secondary"
              leadingIcon={demoBusy ? <Spinner size="sm" /> : <FlaskConical className="size-4" />}
              onClick={handleLoadDemo}
              disabled={demoBusy}
            >
              {demoBusy ? 'Generating…' : 'Load demo data'}
            </Button>
          </div>
        </div>
        {demoBusy && demoProgress ? (
          <div className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
            Generating &amp; analyzing demo image {demoProgress.index + 1} of {demoProgress.total}: {demoProgress.label}
          </div>
        ) : null}
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
          <CardContent className="max-w-md">
            Upload your first thermal image, or load the demonstration dataset to explore the full workflow with three
            clearly-labeled fictional scenarios.
          </CardContent>
          <div className="flex gap-2">
            <Button leadingIcon={<ScanLine className="size-4" />} onClick={() => navigate('/inspections/new')}>
              Start an inspection
            </Button>
            <Button variant="outline" appearance="secondary" onClick={handleLoadDemo} disabled={demoBusy}>
              Load demo data
            </Button>
          </div>
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

          <CautionNotice compact />

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
                        <Badge appearance={statusAppearance(i.status)} variant="soft" size="sm">
                          {i.status}
                        </Badge>
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
