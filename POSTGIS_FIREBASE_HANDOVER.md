# Alistra GIS PostGIS / Firebase Handover

Date: 2026-07-13

## Current Situation

The app has been switched toward PostGIS/Hetzner as the authoritative map source, but the frontend still contains several Firestore-era assumptions. After Firestore map data was wiped, those assumptions became visible as regressions:

- Assets can be saved to PostGIS but not render because the UI is still filtering through old local-state rules.
- Some import paths write through PostGIS, while other paths still update React state first and rely on old whole-array save behaviour.
- Some features still load mapping/exchange/home data through Firestore-named modules, even where those modules partly branch to PostGIS.
- Layer counts and layer renderers do not always use the same classification rules, so a cable can be counted but not drawn.

The key point: this is not one bug. It is a mixed persistence model problem.

## What Should Stay Firebase

These are not the immediate problem and do not need to be moved first:

- Authentication:
  - `src/firebase.ts`
  - `src/components/AuthGate.tsx`
  - `src/components/UserMenu.tsx`
  - `server/src/middleware/authMiddleware.ts`
- User profiles / roles:
  - `src/context/UserRoleContext.tsx`
  - `src/components/admin/UserManagementPanel.tsx`
- Photo/file uploads to Firebase Storage:
  - `src/components/map/modals/PoleDetailsModal.tsx`
  - `src/components/map/modals/DistributionPointDetailsModal.tsx`
  - `src/components/map/modals/ChamberDetailsModal.tsx`
  - `src/components/map/pia/PiaAssetEditor.tsx`
  - `src/core/engineering/jobPackArchiveStorage.ts`
- Local UI preferences:
  - `localStorage` map view, layer toggles, app mode, job-pack drafts.

Those are separate from map authority.

## Dangerous Mixed Map Areas

### 1. Main Map Assets

Files:

- `src/services/mapSaveCoordinator.ts`
- `src/services/mapAssetStorage.ts`
- `src/components/JointMapManager.tsx`
- `src/components/map/persistence/useAssetPersistence.ts`
- `src/services/spatialApi/spatialAssetWriteService.ts`
- `src/services/spatialApi/useSpatialViewportAssets.ts`
- `src/services/spatialApi/spatialAssetAdapter.ts`

Problem:

- `saveMapAssetsViaCoordinator` branches between PostGIS and Firestore.
- In PostGIS-only mode it skips Firestore, but a lot of UI code still expects a complete local `savedJoints` array.
- PostGIS assets are fetched by viewport, not held as one complete in-memory project array.
- Existing code often saves a full array, but the server model should upsert exact changed assets.

Recommendation:

- Stop using whole-array saves for map edits/imports.
- Make every map change call a direct PostGIS upsert/delete endpoint.
- Keep React state only as display cache.
- Keep Firestore map fallback only behind non-production `VITE_MAP_DATA_SOURCE=firestore|dual`.

### 2. Homes / UPRNs

Files:

- `src/components/map/projects/projectHomesStorage.ts`
- `src/components/map/homes/useHomeImportTools.ts`
- `src/components/map/import/useMapImportExportTools.ts`
- `src/components/map/homes/useProjectHomesController.ts`
- `src/components/map/hooks/useHomesController.ts`

Problem:

- Homes used to live in Firestore `projectHomes/{area}/chunks`.
- In PostGIS-only mode `projectHomesStorage` now reads/writes `assetType=home`, but the module still has Firestore fallback logic.
- It currently loads homes with world bounds and `limit: 10_000`, which is unsafe for larger areas.
- Some UI paths keep homes in `projectHomes`, separate from `savedJoints`, while PostGIS returns them through viewport assets.

Recommendation:

- Treat homes as normal PostGIS map assets.
- Remove the separate project-home chunk mental model from PostGIS mode.
- Replace world-bounds home loading with area/bounds-specific API calls.
- Ensure import success only appears after server write confirmation.

### 3. Cables

Files:

- `src/components/JointMapManager.tsx`
- `src/components/map/cables/CableLinesLayer.tsx`
- `src/components/map/layers/useLayerCounts.ts`
- `src/services/spatialApi/spatialAssetLayerRules.ts`

Current regression:

- User can finish a cable.
- Cable count appears in layer panel, for example `Feeders (2)`.
- Cable may not draw on the map.

Likely causes:

- Count logic and render logic classify cables differently.
- `CableLinesLayer` applies subtype/viewport/render filters separate from the layer count.
- PostGIS cables return through viewport fetch, not necessarily through the same local array used during drawing.

Recommendation:

- Use one shared classifier for cable type/count/render:
  - feeder
  - link
  - drop
  - 96/48/36/24/12 ULW
- Use that classifier in both `useLayerCounts` and `CableLinesLayer`.
- Do not rely on `cableType` alone; include name, fibre count, asset subtype, imported metadata.

### 4. Joint Mapping Rows

Files:

- `src/components/FibreTrayEditor.tsx`
- `src/components/map/cables/cableMappingRows.ts`
- `src/components/map/hooks/useJointMappings.ts`
- `src/services/spatialApi/jointMappingRecordStorage.ts`
- `src/services/spatialApi/spatialRecordService.ts`

Problem:

- Some functions are still named `*FromFirestore`, but in PostGIS-only mode they redirect to PostGIS records.
- `FibreTrayEditor.tsx` still has direct Firestore chunk write/read functions.
- Cable fibre usage depends on these rows.

Recommendation:

- Create a neutral module name, e.g. `jointMappingStorage.ts`.
- Move all row reads/writes behind:
  - `loadJointMappingRows(jointId)`
  - `saveJointMappingRows(jointId, rows)`
- In PostGIS-only mode, no component should import Firestore directly for joint mappings.

### 5. Exchanges

Files:

- `src/components/map/storage/exchangeStorage.ts`
- `src/components/exchange/ExchangeDesigner.tsx`
- `src/components/map/exchange/useExchangeController.ts`

Current state:

- This is partly migrated.
- In PostGIS-only mode it uses app records:
  - `exchange`
  - `exchange-olt`
  - `exchange-hd-splitter-panel`
  - `exchange-feeder-panel`
- Firestore fallback remains in the same file.

Problem:

- Mixed storage in one file makes it hard to know what production is actually using.
- Exchange markers are separate from `map_assets`, so map search/layers need to intentionally merge them.

Recommendation:

- Keep exchange records in PostGIS `app_records`.
- Split into two implementations:
  - `exchangeStorage.postgis.ts`
  - `exchangeStorage.firestore.ts`
- Export one adapter based on config.

### 6. Admin Wipe / Reset

Files:

- `src/components/JointMapManager.tsx`
- `src/services/mapAssetStorage.ts`
- `src/services/spatialApi/spatialAssetWriteService.ts`
- `server/src/services/assetWriteService.ts`

Current state:

- PostGIS wipe deletes `map_assets` and selected app records.
- Firestore wipe writes empty safety docs and may not truly delete every document because Firestore rules can block deletes.

Problem:

- The UI has previously claimed “deleted” while old data still appeared because the source was not the one being viewed.

Recommendation:

- In PostGIS-only production, the admin wipe button should call only the PostGIS wipe endpoint.
- Firestore cleanup should be separate and clearly labelled “legacy Firestore cleanup”.
- After wipe, clear viewport cache and local React state.

## Current Server / API Shape

PostGIS map assets:

- Table: `map_assets`
- API:
  - `GET /api/assets`
  - `POST /api/assets`
  - `PUT /api/assets/:id`
  - `POST /api/assets/bulk`
  - `DELETE /api/assets/:id`
  - `DELETE /api/assets/admin/wipe-map-data`

App records:

- Table: `app_records`
- API:
  - `GET /api/records`
  - `GET /api/records/:recordType/:recordId`
  - `PUT /api/records/:recordType/:recordId`
  - `DELETE /api/records/:recordType/:recordId`

This split is reasonable:

- `map_assets` for things with geometry.
- `app_records` for exchange internals and joint mapping chunks.

## Main Architectural Fix Needed

The frontend needs a single production storage contract:

```ts
mapAssetStore.listByViewport(...)
mapAssetStore.upsert(asset)
mapAssetStore.upsertMany(assets)
mapAssetStore.delete(id)

homeStore.importHomes(areaId, homes)

jointMappingStore.load(jointId)
jointMappingStore.save(jointId, rows)

exchangeStore.loadMarkers()
exchangeStore.loadExchange(id)
exchangeStore.saveExchange(exchange)
```

Components should not know whether this is Firestore or PostGIS.

Right now components still know too much.

## Immediate Stabilisation Plan

### Phase 1 - Freeze Random Patches

Do not keep patching individual symptoms until these checks are done:

1. Confirm Hetzner has latest API:
   - `/api/assets/bulk` exists.
   - `/api/health` returns database connected.
2. Confirm Vercel env:
   - `VITE_SPATIAL_API_ENABLED=true`
   - `VITE_SPATIAL_API_WRITES_ENABLED=true`
   - `VITE_MAP_DATA_SOURCE=postgis`
   - `VITE_SPATIAL_API_URL=https://api.alistragis.com`
3. Confirm browser hard refresh loads latest bundle.

### Phase 2 - Make PostGIS The Only Map Path

In production/PostGIS mode:

- Disable Firestore map load.
- Disable Firestore map save.
- Disable local full-array save assumptions.
- All create/edit/import/delete map operations must call PostGIS.

### Phase 3 - Normalize Render Data

Create shared asset classifiers:

- `isCable`
- `getCableLayerKind`
- `isHome`
- `isArea`
- `isDistributionPoint`
- `isJoint`

Use these shared classifiers in:

- layer counts
- render layers
- import classification
- search
- workspace filters

This prevents “count says 2, map draws 0”.

### Phase 4 - Migrate Remaining Firestore Map Features

Move or isolate:

- `FibreTrayEditor.tsx` joint mapping chunks
- `ProjectWorkspace.tsx` joint mapping reads
- `CableLinesLayer.tsx` mapping row reads
- `projectHomesStorage.ts` Firestore naming/fallback
- `exchangeStorage.ts` split implementation

### Phase 5 - Verification Checklist

After migration:

1. Wipe PostGIS map assets.
2. Upload polygons.
3. Refresh.
4. Confirm polygons remain.
5. Upload DPs/closures.
6. Refresh.
7. Confirm DPs remain.
8. Upload homes.
9. Refresh.
10. Confirm homes remain and layer counts match markers.
11. Draw cable.
12. Confirm it appears immediately, count increments, and survives refresh.
13. Upload address sheet.
14. Confirm homes/DPs/drops update and survive refresh.
15. Open joint tray editor.
16. Save mapping.
17. Refresh and confirm mapping rows reload.
18. Open exchange workspace.
19. Save exchange layout.
20. Refresh and confirm OLT/splitter/feeder records reload.

## Known Current Risk

There is an unrelated local deletion in the worktree:

- `Alistra_GIS_Meet_Me_Chamber_Template.xlsx`

This has not been staged by recent commits. Decide whether to restore or intentionally delete it before the next clean commit.

## Recommendation

The project should stop treating this as “fix the latest visible bug” and do a controlled storage cleanup:

1. Keep Firebase Auth and Storage.
2. Keep Firestore only for user profile/admin data unless explicitly needed.
3. Move all map geometry and map workflow records to PostGIS/app records.
4. Add a single adapter layer so components stop importing Firestore/PostGIS directly.
5. Then test every workflow once against the server.

