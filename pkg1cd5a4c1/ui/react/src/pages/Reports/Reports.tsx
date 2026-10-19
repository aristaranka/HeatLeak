import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchInspections,
  fetchBuildings,
  statusAppearance,
  priorityAppearance,
  formatDate,
  INSPECTION_STATUSES,
  ThermalInspection,
  Building,
} from '@/lib/heatleak';

export default function Reports() {
  const navigate = useNavigate();
  const [inspections, setInspections] = useState<ThermalInspection[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [buildingFilter, setBuildingFilter] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchInspections(), fetchBuildings()])
      .then(([insp, bldg]) => {
        setInspections(insp);
        setBuildings(bldg);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reports.'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () =>
      inspections.filter(
        (i) =>
          (!statusFilter || i.status === statusFilter) &&
          (!buildingFilter || i.building?.id === buildingFilter),
      ),
    [inspections, statusFilter, buildingFilter],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading reports" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">
      <div>
        <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Inspection reports</h1>
        <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
          Structured, printable inspection reports. Filter by building or status and open a report to review or export.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="w-56">
          <Combobox
            placeholder="All buildings"
            value={buildingFilter}
            onValueChange={setBuildingFilter}
            options={buildings.map((b) => ({ value: b.id, label: b.name }))}
          />
        </div>
        <div className="w-48">
          <Combobox
            placeholder="All statuses"
            value={statusFilter}
            onValueChange={setStatusFilter}
            options={INSPECTION_STATUSES.map((s) => ({ value: s, label: s }))}
          />
        </div>
      </div>

      {error ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-3 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
          {error}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <FileText className="size-8 text-[var(--hl-cyan)]" aria-hidden />
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">No reports match these filters.</p>
        </Card>
      ) : (
        <Card className="p-0">
          <ul className="flex flex-col divide-y divide-[var(--c3-style-basic-border-border)]">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => navigate(`/reports/${i.id}`)}
                  className="flex w-full items-center gap-4 p-4 text-left hover:bg-[var(--c3-style-basic-bg-hover)]"
                >
                  <div className="hidden h-14 w-20 shrink-0 overflow-hidden rounded-[var(--c3-style-border-radius-4)] bg-black sm:block">
                    {i.annotatedImage || i.originalImage ? (
                      <img src={i.annotatedImage || i.originalImage} alt="" className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">
                        {i.buildingName || i.name}
                      </span>
                      {i.isDemo ? <DemoBadge /> : null}
                    </div>
                    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      Report #{i.id.slice(-6)} · {formatDate(i.inspectionDate)} · {i.anomalyCount ?? 0} findings
                    </span>
                  </div>
                  {i.priority ? (
                    <Badge appearance={priorityAppearance(i.priority)} variant="soft" size="sm">
                      {i.priority}
                    </Badge>
                  ) : null}
                  <Badge appearance={statusAppearance(i.status)} variant="soft" size="sm">
                    {i.status}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
