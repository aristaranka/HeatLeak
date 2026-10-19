import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Trash2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Combobox } from '@/components/ui/combobox';
import { Spinner } from '@/components/ui/spinner';
import {
  Modal,
  ModalContent,
  ModalHeader,
  ModalTitle,
  ModalBody,
  ModalFooter,
  ModalFooterActions,
} from '@/components/ui/modal';
import DemoBadge from '@/components/heatleak/DemoBadge';
import {
  fetchBuildings,
  createBuilding,
  removeBuilding,
  needsFollowUp,
  BUILDING_TYPES,
  BuildingType,
  Building,
} from '@/lib/heatleak';

export default function Buildings() {
  const navigate = useNavigate();
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [type, setType] = useState<BuildingType>('Residential');
  const [location, setLocation] = useState('');

  const load = () => {
    setLoading(true);
    fetchBuildings()
      .then((list) => setBuildings(list.filter((b) => !b.isDemo)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load buildings.'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await createBuilding({ name: name.trim(), buildingType: type, location: location.trim() || undefined });
      setOpen(false);
      setName('');
      setLocation('');
      setType('Residential');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create building.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (b: Building) => {
    if (!window.confirm(`Remove “${b.name}”? Its inspections are kept but unlinked.`)) return;
    try {
      await removeBuilding(b.id);
      setBuildings((prev) => prev.filter((x) => x.id !== b.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to remove building.');
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size="lg" label="Loading buildings" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-c3-bold-heading-h4 text-[var(--c3-style-basic-fg-primary)]">Buildings</h1>
          <p className="mt-1 text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            Track the buildings you inspect and their open thermal findings.
          </p>
        </div>
        <Button leadingIcon={<Plus className="size-4" />} onClick={() => setOpen(true)}>
          Add building
        </Button>
      </div>

      {error ? (
        <div className="rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-danger)] bg-[var(--c3-style-basic-bg-danger)] p-3 text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-danger)]">
          {error}
        </div>
      ) : null}

      {buildings.length === 0 ? (
        <Card className="items-center gap-3 py-12 text-center">
          <Building2 className="size-8 text-[var(--hl-cyan)]" aria-hidden />
          <p className="text-c3-regular-body-p2 text-[var(--c3-style-basic-fg-secondary)]">
            No buildings yet. Add one, or start a new inspection.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {buildings.map((b) => {
            const inspections = b.inspections ?? [];
            const unresolved = inspections.filter((i) => needsFollowUp(i.status)).length;
            return (
              <Card key={b.id} className="gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-c3-bold-body-p2 text-[var(--c3-style-basic-fg-primary)]">{b.name}</span>
                      {b.isDemo ? <DemoBadge label="Fictional" /> : null}
                    </div>
                    <span className="text-c3-regular-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                      {b.buildingType || 'Unspecified'}
                      {b.location ? ` · ${b.location}` : ''}
                    </span>
                  </div>
                  {!b.isDemo ? (
                    <Button
                      variant="ghost"
                      appearance="danger"
                      size="icon-sm"
                      aria-label={`Remove ${b.name}`}
                      onClick={() => handleDelete(b)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Badge appearance="secondary" variant="soft" size="sm">
                    {inspections.length} inspection{inspections.length === 1 ? '' : 's'}
                  </Badge>
                  <Badge appearance={unresolved > 0 ? 'warning' : 'success'} variant="soft" size="sm">
                    {unresolved} unresolved
                  </Badge>
                </div>
                <Button
                  variant="ghost"
                  appearance="accent"
                  size="sm"
                  className="self-start"
                  trailingIcon={<ChevronRight className="size-4" />}
                  onClick={() => navigate('/reports')}
                >
                  View inspections
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={open} onOpenChange={setOpen}>
        <ModalContent>
          <ModalHeader>
            <ModalTitle>Add building</ModalTitle>
          </ModalHeader>
          <ModalBody className="flex flex-col gap-4 p-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-bname" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Name
              </label>
              <Input id="new-bname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 128 Elm Street" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-btype" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Type
              </label>
              <Combobox
                id="new-btype"
                value={type}
                onValueChange={(v) => v && setType(v as BuildingType)}
                options={BUILDING_TYPES.map((t) => ({ value: t, label: t }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="new-bloc" className="text-c3-bold-label-l3 text-[var(--c3-style-basic-fg-secondary)]">
                Location <span className="font-normal">(optional)</span>
              </label>
              <Input id="new-bloc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, region" />
            </div>
          </ModalBody>
          <ModalFooter>
            <ModalFooterActions className="gap-2">
              <Button variant="outline" appearance="secondary" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={!name.trim() || saving} loading={saving}>
                Add building
              </Button>
            </ModalFooterActions>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
