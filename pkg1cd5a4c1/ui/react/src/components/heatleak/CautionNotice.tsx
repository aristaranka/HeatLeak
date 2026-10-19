import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Scientific-caveat banner surfaced wherever analysis results are shown.
 *
 * The spec requires that the product never overstate what a thermal image can
 * prove: warm colors alone do not confirm heat loss, palettes differ between
 * cameras, reflections and emissivity distort apparent temperature, and without
 * radiometric metadata no absolute temperatures can be derived. These are
 * preliminary screening observations, not confirmed defects.
 */
export default function CautionNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="flex gap-3 rounded-[var(--c3-style-border-radius-6)] border border-[var(--c3-style-basic-border-warning)] bg-[var(--c3-style-basic-bg-warning)] p-3"
      role="note"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--c3-style-basic-fg-warning)]" aria-hidden />
      <div className="text-c3-regular-body-p3 text-[var(--c3-style-basic-fg-warning)]">
        <span className="text-c3-bold-body-p3">Preliminary screening — verify before acting. </span>
        {compact ? (
          <>Apparent warm/cool areas are not proof of a defect.</>
        ) : (
          <>
            These findings are observations from image contrast only. Warm colors do not by themselves prove heat
            loss; color palettes differ between cameras; reflections and surface emissivity distort apparent
            temperature; and without radiometric metadata no absolute temperatures can be established. Every anomaly
            is a candidate for on-site verification, not a confirmed defect.
          </>
        )}
      </div>
    </div>
  );
}
