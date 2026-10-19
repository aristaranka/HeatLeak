import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ScanLine, Microscope, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchInspections,
  statusAppearance,
  priorityAppearance,
  formatDate,
  INSPECTION_STATUSES,
  ThermalInspection,
} from '@/lib/heatleak';

export default function Analysis() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<ThermalInspection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetchInspections()
      .then(setInspections)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load inspections.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => (statusFilter ? inspections.filter((i) => i.status === statusFilter) : inspections),
    [inspections, statusFilter],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading inspections" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Thermal analysis</h1>
          <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            Every analyzed image, with its flagged anomalies. Open one to review the interactive viewer and findings.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="w-48">
            <Combobox
              placeholder="All statuses"
              value={statusFilter}
              onValueChange={setStatusFilter}
              options={INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))}
            />
          </div>
          <Button leadingIcon={<ScanLine className="size-4" />} onClick={() => navigate('/inspections/new')}>
            New inspection
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-3 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Microscope className="size-8 text-[var(--hl-cyan)]" aria-hidden />
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            No inspections {statusFilter ? `with status “${statusFilter}”` : 'yet'}.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((i) => (
            <Link key={i.id} to={`/analysis/${i.id}`}>
              <Card variant="elevated" className="h-full gap-0 overflow-hidden p-0 transition-colors hover:border-[var(--hl-cyan)]">
                <div className="relative aspect-video w-full bg-black">
                  {i.annotatedImage || i.originalImage ? (
                    <img
                      src={i.annotatedImage || i.originalImage}
                      alt={`Thermal view of ${i.buildingName}`}
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                  <div className="absolute left-2 top-2 flex gap-1">{i.isDemo ? <DemoBadge /> : null}</div>
                </div>
                <div className="flex flex-col gap-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                      {i.buildingName || i.name}
                    </span>
                    <Badge appearance={statusAppearance(i.status)} variant="soft" size="sm">
                      {i.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                    <span>{formatDate(i.inspectionDate)}</span>
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="size-3" aria-hidden /> {i.anomalyCount ?? 0} flagged
                    </span>
                  </div>
                  {i.priority ? (
                    <Badge appearance={priorityAppearance(i.priority)} variant="soft" size="sm" className="self-start">
                      {i.priority} priority
                    </Badge>
                  ) : null}
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
