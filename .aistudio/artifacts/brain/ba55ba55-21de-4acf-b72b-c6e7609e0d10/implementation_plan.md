# Production Deployment Stability & Synchronization Plan

A comprehensive plan to safely package and deploy all recent stability enhancements, loading screen fail-safes, and build configuration fixes to Vercel without risking build errors or runtime freezes.

### User Review & Critical Decisions

> [!IMPORTANT]
> The user confirmed the deployment direction:
> - **Deployment Objective**: Synchronize and safely deploy the latest fixes to Vercel.
> - **Feature Scope**: No additional feature changes or UI redesigns; 100% focused on deployment stability, build verification, and clean runtime operation.

---

### 1. Overview & Core Concept

- **What It Delivers**: A production-ready, hardened codebase that builds cleanly under Vercel's Node 20/22 ESM environment and boots reliably on `eppsw.vercel.app` without hanging on the splash screen.
- **Core Stability Objectives**:
  1. **Build Reliability**: Eliminate all ESM path resolution errors (`__dirname`), duplicate npm dependencies, and legacy module import warnings during `npm run build`.
  2. **Startup Resilience**: Guarantee that the loading screen never freezes—even under high latency, offline mode, or cold starts—via a 1-second safety transition and instant profile fallback in `RoleGate`.
  3. **Clean Workspace State**: Ensure the removal of obsolete modules (`excelParser`, `GoogleSheetsBackupManager`, `googleSheetsBackupService`) leaves 0 lingering references in production code.

---

### 2. User Experience & Visual Stability

- **Fast & Deterministic Boot Flow**:
  - **Launch**: Splash screen pulses for at most 1 second, or transitions immediately upon user click.
  - **Authentication**: `RoleGate` renders operational profiles (`Shift A`, `Shift B`, `Manager`) with zero lag using instant memory fallbacks, refreshing seamlessly in the background once Firestore connects.
  - **Workspace Entry**: Operators and supervisors access clean, uncluttered workspace interfaces with the removed "LIVE FIRESTORE" badge and removed "PDF Only" filter button in Invoice Archive.
- **Visual Identity**:
  - Deep industrial dark theme (`#070e18`) with high-contrast status colors.
  - Strict anti-clutter rules preserved: concise labels, compact tables, no technical jargon.

---

### 3. Key Technical Decisions & Trade-Offs

- **Decision 1: ESM-Standard `fileURLToPath` in `vite.config.ts`**
  - *Chosen Approach*: Replace raw `__dirname` with `fileURLToPath(import.meta.url)` in `vite.config.ts`.
  - *Why*: In Node 20/22 ESM environments (`"type": "module"`), `__dirname` is not defined globally. Using `fileURLToPath` is 100% portable across Vercel, local machines, and containerized CI/CD.
  - *Alternative Considered*: Hardcoded relative aliases (less robust for nested imports).

- **Decision 2: Guaranteed Startup Transition in `App.tsx`**
  - *Chosen Approach*: Enforce a 1,000ms safety timeout that clears `loading` if remote Firestore snapshot listeners take longer than expected to negotiate WebSockets/tab locks.
  - *Why*: Eliminates the black-screen freeze observed on `eppsw.vercel.app`.
  - *Alternative Considered*: Blocking startup until all 12 collections synchronize (leads to infinite loading on connection delay).

- **Decision 3: Deduplication in `package.json`**
  - *Chosen Approach*: Keep build tools (`vite`) exclusively in `devDependencies`.
  - *Why*: Prevents npm lockfile mismatch during Vercel's `npm ci` phase.

- **Decision 4: Static Firestore Imports in `bezelService.ts`**
  - *Chosen Approach*: Removed redundant `await import("firebase/firestore")` inside `bezelService.ts`, relying on top-level static imports.
  - *Why*: Eliminates Rollup bundle-splitting chunk warnings during production builds.

---

### 4. Technical Architecture & Verification Diagram

```
┌──────────────────────────────────────────────────────────────┐
│                    Vercel CI/CD Pipeline                     │
│  npm install (clean lockfile)  ──>  npm run build (Vite ESM)  │
└──────────────────────────────┬───────────────────────────────┘
                               │ Produces /dist (0 errors)
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                  Production Client Runtime                   │
│                                                              │
│  ┌───────────────────────┐        ┌───────────────────────┐  │
│  │   App.tsx Bootstrapping  │ 1.0s │   RoleGate Auth Gate  │  │
│  │   - 1.0s Safety Timer ├───────►│   - Instant Profiles  │  │
│  │   - Priority Users Sub│        │   - PIN Verification  │  │
│  └───────────┬───────────┘        └───────────┬───────────┘  │
│              │                                │              │
│              ▼                                ▼              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │           EPP Natur Steering Wheel Workspaces          │  │
│  │   - Dashboard, Deliveries, Stock 1/2/3, Invoices       │  │
│  │   - Clean UI: No "PDF Only" button, No Live Badge     │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

---

### 5. Verification Checklist

1. [x] **Import Integrity**: 0 broken imports across all `.ts` and `.tsx` source files.
2. [x] **Type Safety**: `tsc --noEmit` completes with 0 errors.
3. [x] **Production Bundle**: `vite build` transforms all 2,733 modules and outputs clean bundles in under 14 seconds without dynamic import warnings.
4. [x] **Multi-Platform Compatibility**: `vite.config.ts` tested for ESM compliance on Node 20+.
5. [x] **Compilation**: `compile_applet` reports successful build.
