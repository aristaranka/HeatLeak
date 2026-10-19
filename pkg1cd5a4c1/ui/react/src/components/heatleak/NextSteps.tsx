import React from 'react';
import type { ThermalAnomaly } from '@/lib/heatleak';

export interface NextStepsProps {
  anomalies: ThermalAnomaly[];
  inspectionId: string;
}

/**
 * Placeholder for Engineer C's "Suggested next steps" report section
 * (branch feat/next-steps-sim). Same props as the real component; renders
 * nothing so ReportDetail can wire it in before merge. At merge, take C's file.
 */
const NextSteps: React.FC<NextStepsProps> = () => null;

export default NextSteps;
