import React from 'react';
import { FlaskConical } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

/**
 * Marks fictional demonstration data so it is never mistaken for a real
 * inspection of a real building. Used on demo inspections and sample buildings.
 */
export default function DemoBadge({ label = 'Demo data' }: { label?: string }) {
  return (
    <Badge appearance="info" variant="soft" size="sm" leadingIcon={<FlaskConical className="size-3" />}>
      {label}
    </Badge>
  );
}
