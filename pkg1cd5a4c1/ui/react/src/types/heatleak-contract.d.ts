/*
 * HeatLeak AI — contract (§4) fields, Engineer D (feat/triage-queue).
 *
 * Engineer B provisions `ThermalAnomaly.rejected / rejectionReason / source` and
 * `ThermalInspection.explanationSource` and adds them to the interfaces in
 * `lib/heatleak.ts` in place. Until that merge the client treats them as optional;
 * this augmentation makes them visible to the type-checker without editing B's
 * interfaces (`lib/heatleak.ts` is add-only, and re-declaring its exported
 * interfaces trips the `import/export` lint rule on the originals as well).
 *
 * Identical optional members merge without error, so this file is harmless once
 * B's lines land — delete it at merge or leave it.
 */
import '@/lib/heatleak';

declare module '@/lib/heatleak' {
  interface ThermalAnomaly {
    /** Model judged this candidate is not a building-envelope pattern. Box kept for display. */
    rejected?: boolean;
    /** One sentence, e.g. "Open sky above the roofline, not a building surface." */
    rejectionReason?: string;
    /** 'cv' = proposed by the pixel scout; 'vision' = added by the model. */
    source?: 'cv' | 'vision';
    /** Owning inspection — populated only when fetched with `inspection.id` (triage-queue join). */
    inspection?: { id: string };
  }
  interface ThermalInspection {
    /** 'vision' = model saw the image; 'text' = grid + stats only; 'template' = LLM failed, template text. */
    explanationSource?: 'vision' | 'text' | 'template';
  }
}
