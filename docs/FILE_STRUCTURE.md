# Alistra GIS File Structure

This guide is the working map for refactoring the large files into clearer, domain-named modules.

## Current Top-Level Areas

- `src/components/map/` - main Leaflet map UI, layers, map popups, asset editing panels, imports, project area tools, and map-specific hooks.
- `src/components/Project/` - full Project Workspace UI and workspace tabs.
- `src/components/Project/workspace/` - smaller workspace panels, build tools, asset explorers, import helpers, and workspace data helpers.
- `src/components/dp/` - distribution point editor and DP-specific operational screens.
- `src/components/exchange/` - exchange design and exchange UI.
- `src/components/streetcab/` - street cabinet designer and street-cab-specific UI.
- `src/components/topology/` - topology panel UI.
- `src/components/audit/` and `src/components/audits/` - audit UI shared outside the map-specific audit overlays.
- `src/services/` - shared business logic, persistence, storage, topology, network state, intelligence, and export services.
- `src/utils/` - shared UI/business utility helpers.
- `src/context/` - app-wide React contexts.
- `src/types/` - shared TypeScript types.

## Naming Rules Going Forward

Use file names that answer: "what screen or feature does this file own?"

- Prefer `FeatureThing.tsx` over generic names like `Panel.tsx`, `Modal.tsx`, or `Sections.tsx`.
- Put map-only code under `src/components/map/<feature>/`.
- Put workspace-only code under `src/components/Project/workspace/<feature>/`.
- Put non-React business logic under `src/services/<domain>/`.
- Put pure display helpers under `src/components/<domain>/helpers/` only when they are UI-specific.
- Avoid new files over roughly 700 lines. If a file grows past that, split by responsibility before adding more behaviour.

## Refactor Target Structure

### Main Map

Target folder: `src/components/map/`

- `MapShell.tsx` - future replacement shell for the current `JointMapManager.tsx` render orchestration.
- `map/hooks/` - map state, project view, layer visibility, selected asset, and editor mode hooks.
- `map/layers/` - Leaflet layer components only.
- `map/popups/` - popup content for assets/cables/homes.
- `map/modals/` - modal editors launched from map assets.
- `map/panels/` - side panels and toolbar panels.
- `map/audit/` - map-launched audit overlays and audit button routing.
- `map/import/` - GeoJSON/import/export map tools.
- `map/homes/` - home/drop-cable workflows.
- `map/cables/` - cable drawing, cable popup, route editing, and cable allocation UI.
- `map/projects/` - project area selection, project area filtering, and area viewport logic.

### Project Workspace

Target folder: `src/components/Project/workspace/`

- `WorkspaceShell.tsx` - future shell for the current `ProjectWorkspace.tsx`.
- `tabs/` - top-level workspace tab content.
- `panels/` - operation drawer panels.
- `stats/` - workspace KPI and readiness calculations.
- `qa/` - QA issue grouping, navigator, and audit checks.
- `topology/` - workspace topology/trace UI.
- `handover/` - walk-off, delivery phase, handover snapshot, and readiness gate UI.
- `assets/` - asset explorer and asset intelligence surfaces.

### Business Logic

Target folder: `src/services/`

- `services/network/` - network state, fibre propagation, DP routing, cable state, joint matching.
- `services/topology/` - topology graph building and tracing.
- `services/audit/` - audit forms, audit definitions, audit persistence, audit history.
- `services/storage/` - Firestore persistence and chunk storage wrappers.
- `services/export/` - job packs, QGIS, Excel, PDF, and GeoJSON export logic.

## First Files To Split

These are the current heavy files that should be split first:

- `src/components/Project/ProjectWorkspace.tsx`
  - split into `WorkspaceShell`, workspace header, rail navigation, operation drawer, handover panel, and tab routing.
- `src/components/JointMapManager.tsx`
  - split into map shell, map render body, workspace bridge, drawing tools bridge, admin/survey actions, and asset persistence bridge.
- `src/components/map/CableLinesLayer.tsx`
  - split into cable layer rendering, cable popup content, cable route editing, cable endpoint options, and cable fibre usage helpers.
- `src/components/map/AssetMarkersLayer.tsx`
  - split into point asset layer, home clustering/stacking, asset popup content, DP popup summary, and marker icon selection.
- `src/components/map/AssetDetailsSidebarSections.tsx`
  - split by asset type: joint, chamber, pole, DP, home, cable, PIA.
- `src/components/dp/DistributionPointEditor.tsx`
  - split by editor tab/section and move DP-specific calculations into `src/services/network/` or `src/services/dpIntelligence.ts`.

## Safe Refactor Process

1. Move pure helper functions first, with no behaviour change.
2. Move popup/view components next, keeping props explicit.
3. Move hooks after the render components are smaller.
4. Run `npm run build` after every small batch.
5. Avoid moving Firestore storage, save handlers, project homes, permissions, or asset data shapes during UI refactors.

