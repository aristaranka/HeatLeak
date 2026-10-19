/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';

const BOX = { width: 18, height: 18, viewBox: '0 0 18 18' } as const;

export type WorkspaceTreeFileIconKind = 'folder' | 'csv' | 'parquet' | 'md' | 'ipynb' | 'txt' | 'file';

export function workspaceTreeFileIconKind(fileName: string): WorkspaceTreeFileIconKind {
  const lower = fileName.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot) : '';
  switch (ext) {
    case '.csv':
      return 'csv';
    case '.parquet':
      return 'parquet';
    case '.md':
    case '.markdown':
      return 'md';
    case '.ipynb':
      return 'ipynb';
    case '.txt':
      return 'txt';
    default:
      return 'file';
  }
}

function IconWrap({ children, className }: { children: React.ReactNode; className?: string }): React.ReactElement {
  return (
    <svg
      {...BOX}
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** Outline folder */
export function WorkspaceTreeIconFolder({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <path d="M2.75 7h4.25l1.5 1.5h7.75v6.75H2.75V7z" />
      <path d="M2.75 7V5.5h4.25L8.5 7" />
    </IconWrap>
  );
}

/** 2×2 grid — CSV / table */
export function WorkspaceTreeIconCsv({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <rect x="3.25" y="3.25" width="11.5" height="11.5" rx="1" />
      <path d="M9 3.25v11.5M3.25 9h11.5" />
    </IconWrap>
  );
}

/** Cylinder — Parquet / database */
export function WorkspaceTreeIconParquet({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <ellipse cx="9" cy="4.25" rx="5.25" ry="1.75" />
      <path d="M3.75 4.25v9c0 .97 2.35 1.75 5.25 1.75s5.25-.78 5.25-1.75v-9" />
      <path d="M3.75 8.5c0 .97 2.35 1.75 5.25 1.75s5.25-.78 5.25-1.75" />
    </IconWrap>
  );
}

/** Document with lines — Markdown / plain text */
export function WorkspaceTreeIconDocLines({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <path d="M4.5 2.75h6.5l3.75 3.75v9H4.5v-12.75z" />
      <path d="M11 2.75v3.75h3.25" />
      <path d="M6.25 10h5.5M6.25 12h5.5M6.25 14h3.25" strokeWidth="1.15" />
    </IconWrap>
  );
}

/** Notebook + pencil — Jupyter */
export function WorkspaceTreeIconNotebook({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <path d="M5 3.25h6.5l2.75 2.75v9.75H5V3.25z" />
      <path d="M11.5 3.25v2.75h2.75" />
      <path d="M7 10.25h5M7 12.25h5M7 14.25h3" strokeWidth="1.15" />
      <path
        d="M3.75 5.5l1.1-.35.55 1.65-1.35 2.15-.95-.65-.55.35-.55-.55.35-.55-.65-.95 1.35-2.15z"
        strokeWidth="1.1"
      />
    </IconWrap>
  );
}

/** Generic file */
export function WorkspaceTreeIconFile({ className }: { className?: string }): React.ReactElement {
  return (
    <IconWrap className={className}>
      <path d="M5 2.75h5l3.25 3.25v9H5v-12.25z" />
      <path d="M10 2.75v3.25h3.25" />
    </IconWrap>
  );
}

export function WorkspaceTreeFileIcon({
  kind,
  className,
}: {
  kind: WorkspaceTreeFileIconKind;
  className?: string;
}): React.ReactElement {
  switch (kind) {
    case 'folder':
      return <WorkspaceTreeIconFolder className={className} />;
    case 'csv':
      return <WorkspaceTreeIconCsv className={className} />;
    case 'parquet':
      return <WorkspaceTreeIconParquet className={className} />;
    case 'md':
    case 'txt':
      return <WorkspaceTreeIconDocLines className={className} />;
    case 'ipynb':
      return <WorkspaceTreeIconNotebook className={className} />;
    default:
      return <WorkspaceTreeIconFile className={className} />;
  }
}
