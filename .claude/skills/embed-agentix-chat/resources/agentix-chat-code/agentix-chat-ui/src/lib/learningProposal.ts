/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import type { SkillRow } from './types';

/** Pending realtime proposals whose server-stamped source contains this exact chat, newest first. */
export function selectSessionLearningProposals(skills: SkillRow[], sessionId: string): SkillRow[] {
  if (!sessionId) return [];
  return skills
    .filter(
      (skill) =>
        skill.category === 'auto' &&
        skill.approvalState === 'pending' &&
        skill.provenance?.captureLane === 'realtime' &&
        (skill.provenance.sourceSessionIds || []).includes(sessionId)
    )
    .sort((a, b) => (b.provenance?.generatedAtMs || 0) - (a.provenance?.generatedAtMs || 0));
}
