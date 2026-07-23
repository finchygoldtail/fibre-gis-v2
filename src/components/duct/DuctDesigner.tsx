import React, { useEffect, useMemo, useState } from "react";
import type { SavedMapAsset } from "../map/types";

type DuctLayoutItem = {
  id: string;
  diameterMm: number;
  children?: DuctLayoutItem[];
  cableIds?: string[];
};

type DuctLayout = Record<string, DuctLayoutItem[]>;

type DuctPath = {
  path: string;
  label: string;
  item?: DuctLayoutItem;
  ductNumber: number;
  parentDiameterMm: number;
};

type Props = {
  asset: SavedMapAsset;
  allAssets?: SavedMapAsset[];
  onClose: () => void;
  onSave: (updatedDuct: SavedMapAsset, updatedCables: SavedMapAsset[]) => void;
};

const SUB_DUCT_SIZES = [8, 10, 12, 16, 20, 25];
const PACKING_FILL_LIMIT = 0.78;
const VISUAL_CLEARANCE_PERCENT = 3;
const NESTED_VISUAL_CLEARANCE_PERCENT = 2;
const MIN_NESTING_CONTAINER_MM = 25;

type PackedCircle = {
  id: string;
  left: number;
  top: number;
  sizePercent: number;
};

function makeLayoutId() {
  return `subduct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanNumber(value: unknown, fallback: number) {
  const next = Math.round(Number(value));
  return Number.isFinite(next) && next > 0 ? next : fallback;
}

function getDuctCount(asset: SavedMapAsset) {
  return Math.max(1, Math.min(12, cleanNumber((asset as any).ductCount, 1)));
}

function getDuctStartNumber(asset: SavedMapAsset) {
  const stored = cleanNumber((asset as any).ductStartNumber, 0);
  if (stored > 0) return stored;
  const match = String(asset.name || "").trim().match(/^duct\s+(\d+)/i);
  return match ? Number(match[1]) : 1;
}

function getDuctNumbers(asset: SavedMapAsset) {
  const start = getDuctStartNumber(asset);
  return Array.from({ length: getDuctCount(asset) }, (_, index) => start + index);
}

function cloneLayoutItem(item: DuctLayoutItem): DuctLayoutItem {
  return {
    ...item,
    children: item.children?.map(cloneLayoutItem),
    cableIds: item.cableIds ? [...item.cableIds] : undefined,
  };
}

function cloneLayout(layout: DuctLayout): DuctLayout {
  return Object.fromEntries(
    Object.entries(layout).map(([ductNumber, items]) => [
      ductNumber,
      items.map(cloneLayoutItem),
    ]),
  );
}

function normaliseLayoutItem(raw: any): DuctLayoutItem | null {
  const diameterMm = cleanNumber(raw?.diameterMm || raw?.subDuctDiameterMm, 0);
  if (!diameterMm) return null;

  return {
    id: String(raw?.id || makeLayoutId()),
    diameterMm,
    children: Array.isArray(raw?.children)
      ? raw.children.map(normaliseLayoutItem).filter(Boolean) as DuctLayoutItem[]
      : undefined,
    cableIds: Array.isArray(raw?.cableIds)
      ? raw.cableIds.map((value: unknown) => String(value)).filter(Boolean)
      : undefined,
  };
}

function normaliseLayout(asset: SavedMapAsset): DuctLayout {
  const rawTree = (asset as any).subDuctLayoutByDuctNumber;
  const next: DuctLayout = {};

  if (rawTree && typeof rawTree === "object") {
    Object.entries(rawTree).forEach(([ductNumber, rawItems]) => {
      if (!Array.isArray(rawItems)) return;
      next[ductNumber] = rawItems.map(normaliseLayoutItem).filter(Boolean) as DuctLayoutItem[];
    });
  }

  const rawSchedule = (asset as any).subDuctsByDuctNumber;
  if (rawSchedule && typeof rawSchedule === "object") {
    Object.entries(rawSchedule).forEach(([ductNumber, rawEntries]) => {
      if (next[ductNumber]?.length || !Array.isArray(rawEntries)) return;
      next[ductNumber] = rawEntries.flatMap((entry: any) => {
        const diameterMm = cleanNumber(entry?.diameterMm || entry?.subDuctDiameterMm, 0);
        const quantity = Math.max(1, Math.min(24, cleanNumber(entry?.quantity || entry?.count, 1)));
        if (!diameterMm) return [];
        return Array.from({ length: quantity }, () => ({
          id: makeLayoutId(),
          diameterMm,
        }));
      });
    });
  }

  getDuctNumbers(asset).forEach((ductNumber) => {
    if (!next[String(ductNumber)]) next[String(ductNumber)] = [];
  });

  return next;
}

function flattenLayout(layout: DuctLayout, parentDiameterMm: number): DuctPath[] {
  const rows: DuctPath[] = [];

  Object.entries(layout).forEach(([ductNumber, items]) => {
    rows.push({ path: ductNumber, label: `Duct ${ductNumber}`, ductNumber: Number(ductNumber), parentDiameterMm });

    const walk = (item: DuctLayoutItem, parentPath: string, parentLabel: string, containerDiameterMm: number) => {
      const path = `${parentPath}/${item.id}`;
      const label = `${parentLabel} / ${item.diameterMm}mm`;
      rows.push({ path, label, item, ductNumber: Number(ductNumber), parentDiameterMm: containerDiameterMm });
      item.children?.forEach((child) => walk(child, path, label, item.diameterMm));
    };

    items.forEach((item) => walk(item, ductNumber, `Duct ${ductNumber}`, parentDiameterMm));
  });

  return rows;
}

function findItem(items: DuctLayoutItem[], id: string): DuctLayoutItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findItem(item.children || [], id);
    if (child) return child;
  }
  return null;
}

function usedArea(items: DuctLayoutItem[]) {
  return items.reduce((sum, item) => sum + item.diameterMm * item.diameterMm, 0);
}

function maxUsableArea(containerDiameterMm: number) {
  return containerDiameterMm * containerDiameterMm * PACKING_FILL_LIMIT;
}

function canFitSubDucts(
  containerDiameterMm: number,
  existingItems: DuctLayoutItem[],
  diameterMm: number,
  quantity: number,
) {
  if (diameterMm >= containerDiameterMm) return false;
  return usedArea(existingItems) + diameterMm * diameterMm * quantity <= maxUsableArea(containerDiameterMm);
}

function getVisualSizePercent(
  diameterMm: number,
  containerDiameterMm: number,
  options: { scale?: number; min?: number; max?: number } = {},
) {
  const scale = options.scale ?? 92;
  const min = options.min ?? 12;
  const max = options.max ?? 56;
  return Math.max(min, Math.min(max, (diameterMm / containerDiameterMm) * scale));
}

function circlesOverlap(a: PackedCircle, b: PackedCircle, clearancePercent = VISUAL_CLEARANCE_PERCENT) {
  const dx = a.left - b.left;
  const dy = a.top - b.top;
  const minDistance = a.sizePercent / 2 + b.sizePercent / 2 + clearancePercent;
  return Math.sqrt(dx * dx + dy * dy) < minDistance;
}

function circleFitsContainer(circle: PackedCircle) {
  const radius = circle.sizePercent / 2;
  const dx = circle.left - 50;
  const dy = circle.top - 50;
  return Math.sqrt(dx * dx + dy * dy) + radius <= 46;
}

function packSubDuctCircles(
  items: DuctLayoutItem[],
  containerDiameterMm: number,
  options: {
    sizeScale?: number;
    minSize?: number;
    maxSize?: number;
    clearancePercent?: number;
  } = {},
): Record<string, PackedCircle> {
  const sorted = [...items].sort((a, b) => b.diameterMm - a.diameterMm);
  const placed: PackedCircle[] = [];
  const result: Record<string, PackedCircle> = {};
  const clearancePercent = options.clearancePercent ?? VISUAL_CLEARANCE_PERCENT;

  sorted.forEach((item) => {
    const sizePercent = getVisualSizePercent(item.diameterMm, containerDiameterMm, {
      scale: options.sizeScale,
      min: options.minSize,
      max: options.maxSize,
    });
    const candidates: Array<{ left: number; top: number }> = [{ left: 50, top: 50 }];

    for (let radius = 8; radius <= 38; radius += 5) {
      const steps = Math.max(8, Math.ceil((2 * Math.PI * radius) / Math.max(8, sizePercent * 0.65)));
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        candidates.push({
          left: 50 + Math.cos(angle) * radius,
          top: 50 + Math.sin(angle) * radius,
        });
      }
    }

    const circle =
      candidates
        .map((candidate) => ({ id: item.id, sizePercent, ...candidate }))
        .find((candidate) => circleFitsContainer(candidate) && !placed.some((existing) => circlesOverlap(candidate, existing, clearancePercent))) ||
      { id: item.id, left: 50, top: 50, sizePercent };

    placed.push(circle);
    result[item.id] = circle;
  });

  return result;
}

function getTargetContainer(layout: DuctLayout, targetPath: string, rootDiameterMm: number) {
  const [ductNumber, itemId] = targetPath.split("/");
  const targetItems = layout[ductNumber] || [];
  const target = itemId ? findItem(targetItems, itemId) : null;
  return {
    ductNumber,
    target,
    children: target ? target.children || [] : targetItems,
    containerDiameterMm: target ? target.diameterMm : rootDiameterMm,
  };
}

function addSubDuctToLayout(layout: DuctLayout, targetPath: string, diameterMm: number, quantity: number): DuctLayout {
  const next = cloneLayout(layout);
  const [ductNumber, itemId] = targetPath.split("/");
  const targetItems = next[ductNumber] || [];
  const target = itemId ? findItem(targetItems, itemId) : null;

  const additions = Array.from({ length: quantity }, () => ({
    id: makeLayoutId(),
    diameterMm,
  }));

  if (target) {
    target.children = [...(target.children || []), ...additions];
  } else {
    next[ductNumber] = [...targetItems, ...additions];
  }

  return next;
}

function updateLayoutItemDiameter(layout: DuctLayout, itemId: string, diameterMm: number): DuctLayout {
  const next = cloneLayout(layout);

  const walk = (items: DuctLayoutItem[]): boolean => {
    for (const item of items) {
      if (item.id === itemId) {
        item.diameterMm = diameterMm;
        return true;
      }
      if (walk(item.children || [])) return true;
    }
    return false;
  };

  Object.values(next).some(walk);
  return next;
}

function deleteLayoutItem(layout: DuctLayout, itemId: string): DuctLayout {
  const next = cloneLayout(layout);

  const remove = (items: DuctLayoutItem[]): DuctLayoutItem[] =>
    items
      .filter((item) => item.id !== itemId)
      .map((item) => ({
        ...item,
        children: item.children ? remove(item.children) : undefined,
      }));

  Object.keys(next).forEach((ductNumber) => {
    next[ductNumber] = remove(next[ductNumber]);
  });

  return next;
}

function addCableToLayout(layout: DuctLayout, targetPath: string, cableId: string): DuctLayout {
  const next = cloneLayout(layout);
  const [ductNumber, itemId] = targetPath.split("/");
  const item = itemId ? findItem(next[ductNumber] || [], itemId) : null;

  if (item) {
    item.cableIds = Array.from(new Set([...(item.cableIds || []), cableId]));
  }

  return next;
}

function scheduleFromLayout(layout: DuctLayout) {
  const schedule: Record<string, Array<{ diameterMm: number; quantity: number }>> = {};

  Object.entries(layout).forEach(([ductNumber, items]) => {
    const counts = new Map<number, number>();
    items.forEach((item) => {
      counts.set(item.diameterMm, (counts.get(item.diameterMm) || 0) + 1);
    });
    schedule[ductNumber] = Array.from(counts.entries())
      .map(([diameterMm, quantity]) => ({ diameterMm, quantity }))
      .sort((a, b) => b.diameterMm - a.diameterMm);
  });

  return schedule;
}

function cableMatchesDuct(cable: SavedMapAsset, duct: SavedMapAsset) {
  const item = cable as any;
  if (cable.assetType !== "cable") return false;
  if (item.ductId === duct.id) return true;
  if (cable.geometry?.type !== "LineString") return false;
  return !String(item.cableType || "").toLowerCase().includes("drop");
}

function getCableLabel(cable: SavedMapAsset) {
  return `${cable.name || cable.id} - ${cable.fibreCount || (cable as any).cableType || "Cable"}`;
}

function getSubDuctColor(size: number) {
  if (size <= 8) return "#38bdf8";
  if (size <= 10) return "#22c55e";
  if (size <= 12) return "#f59e0b";
  if (size <= 16) return "#8b5cf6";
  if (size <= 20) return "#ef4444";
  return "#14b8a6";
}

export default function DuctDesigner({ asset, allAssets = [], onClose, onSave }: Props) {
  const [layout, setLayout] = useState<DuctLayout>(() => normaliseLayout(asset));
  const [quantity, setQuantity] = useState(1);
  const [draggedSize, setDraggedSize] = useState<number | null>(null);
  const [selectedPath, setSelectedPath] = useState(() => String(getDuctNumbers(asset)[0] || "1"));
  const [selectedCableId, setSelectedCableId] = useState("");
  const [editDiameterMm, setEditDiameterMm] = useState(8);
  const [validationMessage, setValidationMessage] = useState("");

  useEffect(() => {
    const next = normaliseLayout(asset);
    setLayout(next);
    setSelectedPath(String(getDuctNumbers(asset)[0] || "1"));
  }, [asset]);

  const ductDiameterMm = cleanNumber((asset as any).ductDiameterMm, 96);
  const paths = useMemo(() => flattenLayout(layout, ductDiameterMm), [ductDiameterMm, layout]);
  const selected = paths.find((path) => path.path === selectedPath) || paths[0];
  const selectedItem = selected?.item || null;
  const availableCables = useMemo(
    () => allAssets.filter((candidate) => candidate.id !== asset.id && cableMatchesDuct(candidate, asset)),
    [allAssets, asset],
  );

  const assignedCableIds = useMemo(() => {
    const ids = new Set<string>();
    paths.forEach((path) => path.item?.cableIds?.forEach((id) => ids.add(id)));
    return ids;
  }, [paths]);

  useEffect(() => {
    if (selectedItem) {
      setEditDiameterMm(selectedItem.diameterMm);
    }
  }, [selectedItem]);

  const handleDropSize = (targetPath: string, size: number) => {
    const target = getTargetContainer(layout, targetPath, ductDiameterMm);
    if (target.target && target.containerDiameterMm < MIN_NESTING_CONTAINER_MM) {
      setValidationMessage(`${target.containerDiameterMm}mm is too small to contain further sub-ducts. Drop into a 25mm sub-duct or a main duct.`);
      setDraggedSize(null);
      return;
    }

    if (!canFitSubDucts(target.containerDiameterMm, target.children, size, quantity)) {
      setValidationMessage(
        `${quantity} x ${size}mm will not fit inside ${target.containerDiameterMm}mm. Remove something or choose a smaller size.`,
      );
      setDraggedSize(null);
      return;
    }

    setValidationMessage("");
    setLayout((current) => addSubDuctToLayout(current, targetPath, size, quantity));
    setSelectedPath(targetPath);
    setDraggedSize(null);
  };

  const handleUpdateSelectedDiameter = () => {
    if (!selectedItem || !selected) return;
    const [ductNumber] = selected.path.split("/");
    const parentPath = selected.path.split("/").slice(0, -1).join("/");
    const parent = getTargetContainer(layout, parentPath || ductNumber, ductDiameterMm);
    const siblings = parent.children.filter((item) => item.id !== selectedItem.id);

    if (!canFitSubDucts(parent.containerDiameterMm, siblings, editDiameterMm, 1)) {
      setValidationMessage(`${editDiameterMm}mm will not fit in ${parent.containerDiameterMm}mm with the existing contents.`);
      return;
    }

    if ((selectedItem.children || []).length && usedArea(selectedItem.children || []) > maxUsableArea(editDiameterMm)) {
      setValidationMessage(`The nested contents will not fit inside ${editDiameterMm}mm.`);
      return;
    }

    setValidationMessage("");
    setLayout((current) => updateLayoutItemDiameter(current, selectedItem.id, editDiameterMm));
  };

  const handleDeleteSelected = () => {
    if (!selectedItem) return;
    const childCount = selectedItem.children?.length || 0;
    const cableCount = selectedItem.cableIds?.length || 0;
    if ((childCount || cableCount) && !window.confirm(`Delete this ${selectedItem.diameterMm}mm sub-duct and its ${childCount} nested item(s) / ${cableCount} cable assignment(s)?`)) {
      return;
    }

    setLayout((current) => deleteLayoutItem(current, selectedItem.id));
    setSelectedPath(String(selected?.ductNumber || getDuctNumbers(asset)[0] || "1"));
    setValidationMessage("");
  };

  const handleAssignCable = () => {
    const cable = availableCables.find((candidate) => candidate.id === selectedCableId);
    if (!cable || !selected) return;

    setLayout((current) => addCableToLayout(current, selected.path, cable.id));
  };

  const handleSave = () => {
    const nextDuct = {
      ...(asset as any),
      subDuctLayoutByDuctNumber: layout,
      subDuctsByDuctNumber: scheduleFromLayout(layout),
    } as SavedMapAsset;

    const updatedCables = availableCables
      .map((cable) => {
        const assignedPath = paths.find((path) => path.item?.cableIds?.includes(cable.id));
        if (!assignedPath) return null;

        return {
          ...(cable as any),
          ductId: asset.id,
          ductName: asset.name,
          ductNumber: assignedPath.ductNumber,
          ductPath: assignedPath.path,
          ductPathLabel: assignedPath.label,
          subDuctDiameterMm: assignedPath.item?.diameterMm,
        } as SavedMapAsset;
      })
      .filter(Boolean) as SavedMapAsset[];

    onSave(nextDuct, updatedCables);
  };

  const renderItem = (
    item: DuctLayoutItem,
    ductNumber: number,
    parentPath: string,
    containerDiameterMm: number,
    packed: Record<string, PackedCircle>,
  ) => {
    const packedCircle = packed[item.id] || {
      id: item.id,
      left: 50,
      top: 50,
      sizePercent: getVisualSizePercent(item.diameterMm, containerDiameterMm),
    };
    const path = `${parentPath}/${item.id}`;
    const isSelected = selectedPath === path;
    const canNestInside = item.diameterMm >= MIN_NESTING_CONTAINER_MM;
    const nestedPacked = packSubDuctCircles(item.children || [], item.diameterMm, {
      sizeScale: 64,
      minSize: 16,
      maxSize: 34,
      clearancePercent: NESTED_VISUAL_CLEARANCE_PERCENT,
    });

    return (
      <div
        key={item.id}
        role="button"
        onClick={(event) => {
          event.stopPropagation();
          setSelectedPath(path);
        }}
        onDragOver={(event) => {
          if (!canNestInside) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) => {
          if (!canNestInside) return;
          event.preventDefault();
          event.stopPropagation();
          const size = Number(event.dataTransfer.getData("text/plain") || draggedSize);
          if (Number.isFinite(size)) handleDropSize(path, size);
        }}
        style={{
          ...subDuctNode,
          left: `${packedCircle.left}%`,
          top: `${packedCircle.top}%`,
          width: `${packedCircle.sizePercent}%`,
          height: `${packedCircle.sizePercent}%`,
          background: getSubDuctColor(item.diameterMm),
          outline: isSelected ? "3px solid #facc15" : undefined,
          cursor: canNestInside ? "copy" : "pointer",
        }}
        title={`Select ${item.diameterMm}mm in Duct ${ductNumber}`}
      >
        <span>{item.diameterMm}</span>
        {(item.children || []).slice(0, 9).map((child) => {
          const childPath = `${path}/${child.id}`;
          const childCircle = nestedPacked[child.id] || {
            id: child.id,
            left: 50,
            top: 50,
            sizePercent: getVisualSizePercent(child.diameterMm, item.diameterMm, {
              scale: 64,
              min: 16,
              max: 34,
            }),
          };
          return (
            <button
              key={child.id}
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setSelectedPath(childPath);
              }}
              style={{
                ...nestedNode,
                left: `${childCircle.left}%`,
                top: `${childCircle.top}%`,
                width: `${childCircle.sizePercent}%`,
                height: `${childCircle.sizePercent}%`,
                background: getSubDuctColor(child.diameterMm),
                outline: selectedPath === childPath ? "2px solid #facc15" : undefined,
              }}
              title={`Select ${child.diameterMm}mm inside ${item.diameterMm}mm`}
            >
              {child.diameterMm}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div style={shell}>
      <header style={header}>
        <div>
          <div style={kicker}>Duct editor</div>
          <h2 style={title}>{asset.name || "Duct"}</h2>
          <div style={muted}>{getDuctCount(asset)} x {ductDiameterMm}mm - {(asset as any).ductUse || "Main route"}</div>
        </div>
        <div style={headerActions}>
          <button type="button" style={btnSecondary} onClick={onClose}>Close</button>
          <button type="button" style={btnPrimary} onClick={handleSave}>Save duct</button>
        </div>
      </header>

      <main style={grid}>
        <aside style={panel}>
          <section style={card}>
            <div style={sectionTitle}>Sub-duct tray</div>
            <label style={label}>
              Quantity
              <input
                type="number"
                min={1}
                max={12}
                value={quantity}
                onChange={(event) => setQuantity(Math.max(1, Math.min(12, cleanNumber(event.target.value, 1))))}
                style={input}
              />
            </label>
            <div style={palette}>
              {SUB_DUCT_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  draggable
                  onDragStart={(event) => {
                    setDraggedSize(size);
                    event.dataTransfer.setData("text/plain", String(size));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  onDragEnd={() => setDraggedSize(null)}
                  style={{ ...sizeChip, background: getSubDuctColor(size) }}
                >
                  {size}mm
                </button>
              ))}
            </div>
          </section>

          <section style={card}>
            <div style={sectionTitle}>Cable assignment</div>
            <div style={muted}>Target: {selected?.label || "Select a duct"}</div>
            <select value={selectedCableId} onChange={(event) => setSelectedCableId(event.target.value)} style={input}>
              <option value="">Choose cable</option>
              {availableCables.map((cable) => (
                <option key={cable.id} value={cable.id}>
                  {getCableLabel(cable)}
                </option>
              ))}
            </select>
            <button type="button" style={btnPrimary} onClick={handleAssignCable} disabled={!selectedCableId}>
              Add cable to selected path
            </button>
            <div style={cableList}>
              {availableCables.map((cable) => (
                <div key={cable.id} style={cableRow}>
                  <span>{getCableLabel(cable)}</span>
                  <small style={muted}>{assignedCableIds.has(cable.id) ? "Assigned in this duct" : ((cable as any).ductPathLabel || "Unassigned")}</small>
                </div>
              ))}
            </div>
          </section>

          <section style={card}>
            <div style={sectionTitle}>Selected sub-duct</div>
            {selectedItem ? (
              <>
                <div style={muted}>{selected?.label}</div>
                <label style={label}>
                  Size
                  <select
                    value={editDiameterMm}
                    onChange={(event) => setEditDiameterMm(cleanNumber(event.target.value, selectedItem.diameterMm))}
                    style={input}
                  >
                    {SUB_DUCT_SIZES.map((size) => (
                      <option key={size} value={size}>
                        {size}mm
                      </option>
                    ))}
                  </select>
                </label>
                <div style={buttonRow}>
                  <button type="button" style={btnPrimary} onClick={handleUpdateSelectedDiameter}>
                    Update size
                  </button>
                  <button type="button" style={btnDanger} onClick={handleDeleteSelected}>
                    Delete
                  </button>
                </div>
                <div style={muted}>
                  Nested: {selectedItem.children?.length || 0} · Cables: {selectedItem.cableIds?.length || 0}
                </div>
              </>
            ) : (
              <div style={muted}>Select a sub-duct circle to edit or delete it.</div>
            )}
          </section>
        </aside>

        <section style={canvasPanel}>
          <div style={canvasHeader}>
            <div>
              <div style={sectionTitle}>Duct build-up</div>
              <div style={muted}>Drag sizes into a 96mm duct, or into an existing 25mm sub-duct to nest smaller ducts.</div>
            </div>
            <div style={selectedBadge}>{selected?.label || "No selection"}</div>
          </div>

          {validationMessage ? (
            <div style={validationBanner}>{validationMessage}</div>
          ) : null}

          <div style={ductGrid}>
            {getDuctNumbers(asset).map((ductNumber) => {
              const items = layout[String(ductNumber)] || [];
              const packedItems = packSubDuctCircles(items, ductDiameterMm);
              const fill = Math.round(
                (items.reduce((sum, item) => sum + item.diameterMm * item.diameterMm, 0) /
                  (ductDiameterMm * ductDiameterMm)) *
                  100,
              );

              return (
                <div key={ductNumber} style={ductCard}>
                  <button
                    type="button"
                    style={{
                      ...ductCircle,
                      outline: selectedPath === String(ductNumber) ? "3px solid #facc15" : undefined,
                    }}
                    onClick={() => setSelectedPath(String(ductNumber))}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = "copy";
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      const size = Number(event.dataTransfer.getData("text/plain") || draggedSize);
                      if (Number.isFinite(size)) handleDropSize(String(ductNumber), size);
                    }}
                  >
                    {items.map((item) => renderItem(item, ductNumber, String(ductNumber), ductDiameterMm, packedItems))}
                    {!items.length ? <span style={emptyText}>Drop here</span> : null}
                  </button>
                  <div style={ductMeta}>
                    <strong>Duct {ductNumber}</strong>
                    <span>{fill}% fill</span>
                  </div>
                  <div style={scheduleText}>
                    {items.length
                      ? items.map((item) => `${item.diameterMm}mm${item.children?.length ? ` (${item.children.map((child) => `${child.diameterMm}mm`).join(", ")})` : ""}`).join(", ")
                      : "Empty"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

const shell: React.CSSProperties = {
  minHeight: "100%",
  background: "#020617",
  color: "#f8fafc",
  display: "flex",
  flexDirection: "column",
};

const header: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: 18,
  borderBottom: "1px solid #1f2937",
  flexWrap: "wrap",
};

const headerActions: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
};

const kicker: React.CSSProperties = {
  color: "#38bdf8",
  fontWeight: 900,
  fontSize: 12,
  textTransform: "uppercase",
};

const title: React.CSSProperties = {
  margin: "2px 0",
  fontSize: 24,
};

const muted: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 13,
};

const grid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
  gap: 14,
  padding: 14,
  minHeight: 0,
};

const panel: React.CSSProperties = {
  display: "grid",
  gap: 12,
  alignContent: "start",
};

const card: React.CSSProperties = {
  background: "#111827",
  border: "1px solid #1f2937",
  borderRadius: 12,
  padding: 12,
  display: "grid",
  gap: 10,
};

const sectionTitle: React.CSSProperties = {
  fontWeight: 900,
  color: "#e5e7eb",
};

const label: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: "#cbd5e1",
  fontSize: 13,
  fontWeight: 800,
};

const input: React.CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 8,
  border: "1px solid #334155",
  background: "#020617",
  color: "#f8fafc",
  padding: "8px 9px",
};

const palette: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
};

const sizeChip: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.35)",
  color: "#ffffff",
  borderRadius: 999,
  minHeight: 38,
  cursor: "grab",
  fontWeight: 900,
};

const btnPrimary: React.CSSProperties = {
  background: "#2563eb",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 900,
};

const btnSecondary: React.CSSProperties = {
  background: "#1f2937",
  color: "#f8fafc",
  border: "1px solid #334155",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
};

const btnDanger: React.CSSProperties = {
  background: "#dc2626",
  color: "#ffffff",
  border: "none",
  borderRadius: 8,
  padding: "9px 12px",
  cursor: "pointer",
  fontWeight: 900,
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const validationBanner: React.CSSProperties = {
  background: "rgba(127,29,29,0.55)",
  border: "1px solid rgba(248,113,113,0.65)",
  color: "#fecaca",
  borderRadius: 10,
  padding: "10px 12px",
  fontWeight: 800,
};

const cableList: React.CSSProperties = {
  display: "grid",
  gap: 7,
  marginTop: 4,
};

const cableRow: React.CSSProperties = {
  display: "grid",
  gap: 2,
  paddingBottom: 7,
  borderBottom: "1px solid #1f2937",
};

const canvasPanel: React.CSSProperties = {
  background: "#0f172a",
  border: "1px solid #1f2937",
  borderRadius: 14,
  padding: 14,
  display: "grid",
  gap: 14,
  alignContent: "start",
};

const canvasHeader: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};

const selectedBadge: React.CSSProperties = {
  border: "1px solid #334155",
  borderRadius: 999,
  padding: "6px 10px",
  color: "#bfdbfe",
  background: "#111827",
  height: "fit-content",
};

const ductGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 14,
};

const ductCard: React.CSSProperties = {
  display: "grid",
  gap: 8,
  justifyItems: "center",
};

const ductCircle: React.CSSProperties = {
  position: "relative",
  width: "min(210px, 100%)",
  aspectRatio: "1 / 1",
  borderRadius: "50%",
  border: "4px solid #64748b",
  background: "#e5e7eb",
  boxShadow: "inset 0 0 0 12px #cbd5e1",
  cursor: "copy",
  overflow: "hidden",
};

const subDuctNode: React.CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  border: "2px solid rgba(15,23,42,0.65)",
  color: "#ffffff",
  fontWeight: 900,
  display: "grid",
  placeItems: "center",
  cursor: "copy",
  padding: 0,
};

const nestedNode: React.CSSProperties = {
  position: "absolute",
  transform: "translate(-50%, -50%)",
  width: "26%",
  height: "26%",
  borderRadius: "50%",
  border: "1px solid rgba(15,23,42,0.65)",
  display: "grid",
  placeItems: "center",
  color: "#ffffff",
  fontSize: 9,
  fontWeight: 900,
  padding: 0,
  cursor: "pointer",
};

const emptyText: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "grid",
  placeItems: "center",
  color: "#334155",
  fontWeight: 900,
};

const ductMeta: React.CSSProperties = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  color: "#e5e7eb",
  justifyContent: "center",
};

const scheduleText: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  textAlign: "center",
};
