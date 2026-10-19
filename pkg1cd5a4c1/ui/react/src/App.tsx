/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React from 'react';
import { Route, Routes } from 'react-router-dom';
import SideNav from './components/SideNav/SideNav';
import TopNav from './components/TopNav/TopNav';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';
import Overview from './pages/Overview/Overview';
import NewInspection from './pages/NewInspection/NewInspection';
import Analysis from './pages/Analysis/Analysis';
import AnalysisDetail from './pages/Analysis/AnalysisDetail';
import Reports from './pages/Reports/Reports';
import ReportDetail from './pages/Reports/ReportDetail';
import Buildings from './pages/Buildings/Buildings';
import Simulator from './pages/Simulator/Simulator';

/**
 * HeatLeak AI logomark — a stylized thermal "scan" glyph. Inherits the TopNavBar
 * brand-slot color via `currentColor` so it works in both themes.
 */
const HeatLeakLogo = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" role="img">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <path d="M8 14c1.5 0 2-1.5 2-3s-.5-3 1-3 2 2 2 4 1 3 2 3" />
  </svg>
);

/**
 * Application shell.
 *
 * The chrome — {@link TopNav} across the top and {@link SideNav} down the left —
 * is rendered here, OUTSIDE `<Routes>`, so it is present on **every** page. The
 * router only ever swaps the `<main>` content; the top bar and side nav are part
 * of the shell and cannot be dropped by an individual page.
 */
export default function App() {
  return (
    <ErrorReporterProvider>
      <div className="h-screen flex flex-col max-w-full overflow-hidden">
        <TopNav title="HeatLeak AI" logo={HeatLeakLogo} />
        <div className="flex flex-1 min-h-0">
          <SideNav />
          <div className="flex-1 flex flex-col min-w-0">
            <main className="flex-1 overflow-auto bg-[var(--c3-style-basic-bg-page)]">
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/inspections/new" element={<NewInspection />} />
                <Route path="/analysis" element={<Analysis />} />
                <Route path="/analysis/:id" element={<AnalysisDetail />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/reports/:id" element={<ReportDetail />} />
                <Route path="/buildings" element={<Buildings />} />
                <Route path="/simulator" element={<Simulator />} />
                <Route
                  path="*"
                  element={
                    <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                      <p>Page not found.</p>
                    </div>
                  }
                />
              </Routes>
            </main>
          </div>
        </div>
      </div>
    </ErrorReporterProvider>
  );
}
