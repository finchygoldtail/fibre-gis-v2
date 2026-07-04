import type { JobPackDraft, JobPackDraftAsset, JobPackRouteFibreCount } from "./jobPackTypes";
import { buildZip } from "./jobPackZipExporter";

type GeoJsonFeature = {
  type: "Feature";
  geometry: JobPackDraftAsset["geometry"];
  properties: Record<string, string | number | null>;
};

const routeCounts: JobPackRouteFibreCount[] = ["96F", "48F", "36F", "24F", "12F"];

function csvEscape(value: string | number | undefined): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function formatFibres(fibres?: number[]): string {
  if (!fibres?.length) return "";
  const sorted = [...fibres].sort((a, b) => a - b);
  const ranges: string[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    const current = sorted[index];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
    start = current;
    previous = current;
  }
  return ranges.join(", ");
}

function dpFibreLabel(asset: JobPackDraftAsset): string {
  const source = asset.sourceAsset;
  return formatFibres(
    source.dpDetails?.autoFibrePlan?.inputFibres ||
    source.dpDetails?.afnDetails?.inputFibres ||
    source.dpDetails?.mduDetails?.inputFibres ||
    source.allocatedInputFibres,
  );
}

function labelFor(asset: JobPackDraftAsset): string {
  const name = asset.name || asset.id;
  if (asset.group === "route") {
    return [name, asset.fibreCount, asset.cableType].filter(Boolean).join(" ");
  }
  if (asset.group === "distributionPoint") {
    const fibres = dpFibreLabel(asset);
    return fibres ? `${name} F${fibres}` : name;
  }
  return name;
}

function toQgisPosition(position: [number, number]): [number, number] {
  const lat = Number(position[0]);
  const lng = Number(position[1]);
  return [lng, lat];
}

function toQgisGeometry(geometry: JobPackDraftAsset["geometry"]): JobPackDraftAsset["geometry"] {
  if (geometry.type === "Point") {
    return {
      ...geometry,
      coordinates: toQgisPosition(geometry.coordinates),
    };
  }
  if (geometry.type === "LineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(toQgisPosition),
    };
  }
  return {
    ...geometry,
    coordinates: geometry.coordinates.map((ring) => ring.map(toQgisPosition)),
  };
}

function feature(asset: JobPackDraftAsset, draft: JobPackDraft): GeoJsonFeature {
  const label = labelFor(asset);
  const dpFibres = asset.group === "distributionPoint" ? dpFibreLabel(asset) : "";
  return {
    type: "Feature",
    geometry: toQgisGeometry(asset.geometry),
    properties: {
      id: asset.id,
      name: asset.name,
      area_id: draft.areaId,
      pack: draft.packNumber,
      group: asset.group,
      asset_type: asset.assetType,
      status: asset.status || "",
      fibre_count: asset.fibreCount || "",
      fibre_numbers: dpFibres,
      install: asset.installMethod || "",
      cable_type: asset.cableType || "",
      label,
      route_label: asset.group === "route" ? label : "",
      dp_label: asset.group === "distributionPoint" ? label : "",
      joint_label: asset.group === "joint" ? label : "",
      cmj_label: asset.group === "joint" && /cmj/i.test(`${asset.name} ${asset.assetType} ${asset.notes}`) ? label : "",
      link_label: /link/i.test(`${asset.name} ${asset.cableType} ${asset.notes}`) ? label : "",
      notes: asset.notes || "",
    },
  };
}

function collection(assets: JobPackDraftAsset[], draft: JobPackDraft): string {
  return JSON.stringify({
    type: "FeatureCollection",
    name: draft.areaId,
    crs: {
      type: "name",
      properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" },
    },
    features: assets.map((asset) => feature(asset, draft)),
  }, null, 2);
}

function scheduleCsv(rows: Array<{ asset: string; type: string; detail: string; status: string; reviewNote: string }>): string {
  return [
    ["Asset", "Type", "Detail", "Status", "Review Note"].map(csvEscape).join(","),
    ...rows.map((row) => [row.asset, row.type, row.detail, row.status, row.reviewNote].map(csvEscape).join(",")),
  ].join("\n");
}

async function publicAssetText(path: string): Promise<string> {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Could not load QGIS layout asset ${path}`);
  }
  return response.text();
}

function routeStyle(name: string, colour: string, width: number, dashed = false): string {
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34" styleCategories="Symbology|Labeling">
  <renderer-v2 type="singleSymbol">
    <symbols>
      <symbol name="0" type="line" alpha="1">
        <layer class="SimpleLine" enabled="1">
          <Option type="Map">
            <Option name="line_color" value="${colour}"/>
            <Option name="line_width" value="${width}"/>
            <Option name="line_width_unit" value="MM"/>
            <Option name="capstyle" value="round"/>
            <Option name="joinstyle" value="round"/>
            <Option name="line_style" value="${dashed ? "dash" : "solid"}"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
  <labeling type="simple">
    <settings>
      <text-style fontSize="8" fieldName="label" namedStyle="Bold"/>
      <placement placement="2"/>
      <rendering scaleVisibility="1" scaleMin="1" scaleMax="5000"/>
    </settings>
  </labeling>
  <layername>${name}</layername>
</qgis>
`;
}

function pointStyle(name: string, colour: string, size: number, shape = "circle"): string {
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34" styleCategories="Symbology|Labeling">
  <renderer-v2 type="singleSymbol">
    <symbols>
      <symbol name="0" type="marker" alpha="1">
        <layer class="SimpleMarker" enabled="1">
          <Option type="Map">
            <Option name="color" value="${colour}"/>
            <Option name="outline_color" value="0,19,38,255"/>
            <Option name="outline_width" value="0.35"/>
            <Option name="outline_width_unit" value="MM"/>
            <Option name="name" value="${shape}"/>
            <Option name="size" value="${size}"/>
            <Option name="size_unit" value="MM"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
  <labeling type="simple">
    <settings>
      <text-style fontSize="7" fieldName="label" namedStyle="Bold"/>
      <placement placement="0"/>
      <rendering scaleVisibility="1" scaleMin="1" scaleMax="2500"/>
    </settings>
  </labeling>
  <layername>${name}</layername>
</qgis>
`;
}

function polygonStyle(name: string, fill: string, stroke: string, width: number): string {
  return `<!DOCTYPE qgis PUBLIC 'http://mrcc.com/qgis.dtd' 'SYSTEM'>
<qgis version="3.34" styleCategories="Symbology">
  <renderer-v2 type="singleSymbol">
    <symbols>
      <symbol name="0" type="fill" alpha="1">
        <layer class="SimpleFill" enabled="1">
          <Option type="Map">
            <Option name="color" value="${fill}"/>
            <Option name="outline_color" value="${stroke}"/>
            <Option name="outline_width" value="${width}"/>
            <Option name="outline_width_unit" value="MM"/>
            <Option name="style" value="solid"/>
          </Option>
        </layer>
      </symbol>
    </symbols>
  </renderer-v2>
  <layername>${name}</layername>
</qgis>
`;
}

function readme(draft: JobPackDraft): string {
  return [
    "ALISTRA GIS - QGIS JOB PACK EXPORT",
    draft.packNumber,
    "",
    "Purpose",
    "This ZIP is a clean QGIS handoff for producing contractor-style job pack sheets.",
    "It separates the live map export into site-specific layers instead of one mixed saved-assets layer.",
    "",
    "Recommended QGIS setup",
    "1. Open QGIS and create a new project.",
    "2. Add a basemap:",
    "   Browser panel > XYZ Tiles > right-click > New Connection.",
    "   Name: OpenStreetMap",
    "   URL: https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    "   Then drag OpenStreetMap into the map.",
    "3. Add the GeoJSON files from 01_Layers.",
    "4. For each layer, right-click the layer > Properties > Symbology > Style > Load Style, then choose the matching .qml file from 02_QGIS_Styles.",
    "5. Keep the basemap at the bottom, boundary above it, routes above boundary, points above routes.",
    "",
    "Job pack layer order",
    "OpenStreetMap basemap",
    "boundary.geojson",
    "routes_96F.geojson",
    "routes_48F.geojson",
    "routes_36F.geojson",
    "routes_24F.geojson",
    "routes_12F.geojson",
    "route_context.geojson",
    "drops.geojson",
    "joints.geojson",
    "chambers.geojson",
    "poles.geojson",
    "dps.geojson",
    "homes.geojson",
    "",
    "Print layout direction",
    "Use the files in 04_QGIS_Layout as the standard Alistra layout/title-block assets.",
    "In QGIS Layout Manager, add the A3 SVG as a Picture item, then place the map over the MAP FRAME area.",
    "Once the first layout looks right, QGIS Atlas can generate the route sheets automatically.",
    "",
    "Fast automation option",
    "Open 05_Automation/RUN_ME_IN_QGIS.txt and follow the two-step instruction.",
    "The Python script in that folder loads the layers, applies styles, adds OpenStreetMap, creates an A3 layout and exports a PDF.",
  ].join("\n");
}

function qgisAutomationReadme(draft: JobPackDraft): string {
  return [
    "ALISTRA GIS - AUTOMATED QGIS PDF EXPORT",
    draft.packNumber,
    "",
    "This is the quickest route.",
    "",
    "1. Extract the whole QGIS ZIP folder.",
    "2. Open QGIS.",
    "3. Open Plugins > Python Console.",
    "4. Click the folder/open-script icon in the Python Console toolbar.",
    "5. Open this file:",
    "   05_Automation/export_job_pack_pdf.py",
    "6. Click Run Script.",
    "",
    "The script should:",
    "- clear the current QGIS project",
    "- add OpenStreetMap",
    "- load all 01_Layers GeoJSON files",
    "- apply 02_QGIS_Styles QML styling",
    "- zoom to the boundary",
    "- create an A3 landscape print layout",
    "- export a PDF into 06_Output",
    "",
    "If QGIS asks for a folder, choose the extracted QGIS bundle folder that contains 01_Layers.",
  ].join("\n");
}

function qgisAutomationScript(draft: JobPackDraft): string {
  const safeLayoutName = `${draft.areaName || draft.areaId} Job Pack`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safePdfName = `${draft.packNumber}.pdf`.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safeProject = draft.areaId.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const safeArea = draft.areaName.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return [
    "# Alistra GIS automated QGIS job pack setup",
    "# Run inside QGIS: Plugins > Python Console > Open Script > Run Script",
    "",
    "from pathlib import Path",
    "from qgis.PyQt.QtWidgets import QFileDialog",
    "from qgis.PyQt.QtGui import QFont, QColor",
    "from qgis.PyQt.QtCore import Qt",
    "from qgis.core import (",
    "    QgsCoordinateReferenceSystem,",
    "    QgsCoordinateTransform,",
    "    QgsLayerTreeLayer,",
    "    QgsLayoutExporter,",
    "    QgsLayoutItemLabel,",
    "    QgsLayoutItemLegend,",
    "    QgsLayoutItemMap,",
    "    QgsLayoutItemPicture,",
    "    QgsLayoutPoint,",
    "    QgsLayoutSize,",
    "    QgsPrintLayout,",
    "    QgsProject,",
    "    QgsRasterLayer,",
    "    QgsRectangle,",
    "    QgsFillSymbol,",
    "    QgsLineSymbol,",
    "    QgsMarkerSymbol,",
    "    QgsPalLayerSettings,",
    "    QgsSingleSymbolRenderer,",
    "    QgsTextBufferSettings,",
    "    QgsTextFormat,",
    "    QgsUnitTypes,",
    "    QgsVectorLayer,",
    "    QgsVectorLayerSimpleLabeling,",
    ")",
    "",
    "def find_bundle_dir():",
    "    try:",
    "        candidate = Path(__file__).resolve().parents[1]",
    "        if (candidate / '01_Layers').exists():",
    "            return candidate",
    "    except Exception:",
    "        pass",
    "    chosen = QFileDialog.getExistingDirectory(None, 'Select extracted Alistra QGIS bundle folder')",
    "    if not chosen:",
    "        raise RuntimeError('No QGIS bundle folder selected.')",
    "    return Path(chosen)",
    "",
    "bundle = find_bundle_dir()",
    "layers_dir = bundle / '01_Layers'",
    "styles_dir = bundle / '02_QGIS_Styles'",
    "layout_dir = bundle / '04_QGIS_Layout'",
    "output_dir = bundle / '06_Output'",
    "output_dir.mkdir(exist_ok=True)",
    "",
    "project = QgsProject.instance()",
    "project.clear()",
    "project.setCrs(QgsCoordinateReferenceSystem('EPSG:3857'))",
    "",
    "osm_uri = 'type=xyz&url=https://tile.openstreetmap.org/{z}/{x}/{y}.png&zmin=0&zmax=19'",
    "osm = QgsRasterLayer(osm_uri, 'OpenStreetMap', 'wms')",
    "if osm.isValid():",
    "    project.addMapLayer(osm)",
    "    osm_layer_id = osm.id()",
    "else:",
    "    osm_layer_id = ''",
    "    print('WARNING: OpenStreetMap layer did not load. Check internet access in QGIS.')",
    "",
    "layer_order = [",
    "    'boundary.geojson',",
    "    'route_context.geojson',",
    "    'routes_96F.geojson',",
    "    'routes_48F.geojson',",
    "    'routes_36F.geojson',",
    "    'routes_24F.geojson',",
    "    'routes_12F.geojson',",
    "    'drops.geojson',",
    "    'poles.geojson',",
    "    'chambers.geojson',",
    "    'joints.geojson',",
    "    'dps.geojson',",
    "    'homes.geojson',",
    "]",
    "style_for = {",
    "    'boundary': {'kind': 'fill', 'fill': '#9652e126', 'outline': '#9652e1', 'width': 0.65, 'label': ''},",
    "    'route_context': {'kind': 'line', 'color': '#111827', 'width': 0.20, 'label': ''},",
    "    'routes_96F': {'kind': 'line', 'color': '#2563eb', 'width': 0.85, 'label': 'route_label'},",
    "    'routes_48F': {'kind': 'line', 'color': '#06b6d4', 'width': 0.75, 'label': 'route_label'},",
    "    'routes_36F': {'kind': 'line', 'color': '#0ea5e9', 'width': 0.68, 'label': 'route_label'},",
    "    'routes_24F': {'kind': 'line', 'color': '#f59e0b', 'width': 0.62, 'label': 'route_label'},",
    "    'routes_12F': {'kind': 'line', 'color': '#f97316', 'width': 0.58, 'label': 'route_label'},",
    "    'drops': {'kind': 'line', 'color': '#22c55e', 'width': 0.25, 'label': ''},",
    "    'dps': {'kind': 'marker', 'color': '#facc15', 'size': 2.4, 'shape': 'circle', 'label': 'dp_label'},",
    "    'joints': {'kind': 'marker', 'color': '#ec4899', 'size': 2.1, 'shape': 'diamond', 'label': 'joint_label'},",
    "    'chambers': {'kind': 'marker', 'color': '#6b7280', 'size': 2.2, 'shape': 'square', 'label': 'label'},",
    "    'poles': {'kind': 'marker', 'color': '#ffffff', 'size': 1.9, 'shape': 'circle', 'label': 'label'},",
    "    'homes': {'kind': 'marker', 'color': '#fb923c', 'size': 0.7, 'shape': 'square', 'label': ''},",
    "}",
    "",
    "def set_layer_label(layer, field_name, size=7):",
    "    if not field_name:",
    "        layer.setLabelsEnabled(False)",
    "        return",
    "    settings = QgsPalLayerSettings()",
    "    settings.fieldName = field_name",
    "    settings.enabled = True",
    "    text_format = QgsTextFormat()",
    "    font = QFont('Arial')",
    "    font.setPointSizeF(float(size))",
    "    text_format.setFont(font)",
    "    text_format.setSize(size)",
    "    buffer = QgsTextBufferSettings()",
    "    buffer.setEnabled(True)",
    "    buffer.setSize(1.0)",
    "    buffer.setColor(QColor('#ffffff'))",
    "    text_format.setBuffer(buffer)",
    "    settings.setFormat(text_format)",
    "    try:",
    "        if layer.geometryType() == 1:",
    "            settings.placement = QgsPalLayerSettings.Line",
    "        else:",
    "            settings.placement = QgsPalLayerSettings.OverPoint",
    "    except Exception:",
    "        pass",
    "    layer.setLabeling(QgsVectorLayerSimpleLabeling(settings))",
    "    layer.setLabelsEnabled(True)",
    "",
    "def apply_layer_style(layer):",
    "    spec = style_for.get(layer.name(), {})",
    "    kind = spec.get('kind')",
    "    if kind == 'line':",
    "        symbol = QgsLineSymbol.createSimple({})",
    "        symbol.setColor(QColor(spec.get('color', '#0f172a')))",
    "        symbol.setWidth(float(spec.get('width', 0.4)))",
    "        if layer.name().startswith('routes_') or layer.name() == 'route_context':",
    "            try:",
    "                symbol.symbolLayer(0).setPenStyle(Qt.DashLine)",
    "            except Exception:",
    "                pass",
    "        layer.setRenderer(QgsSingleSymbolRenderer(symbol))",
    "    elif kind == 'marker':",
    "        symbol = QgsMarkerSymbol.createSimple({'name': spec.get('shape', 'circle')})",
    "        symbol.setColor(QColor(spec.get('color', '#facc15')))",
    "        symbol.setSize(float(spec.get('size', 2.0)))",
    "        layer.setRenderer(QgsSingleSymbolRenderer(symbol))",
    "    elif kind == 'fill':",
    "        symbol = QgsFillSymbol.createSimple({'color': spec.get('fill', '#9652e126'), 'outline_color': spec.get('outline', '#9652e1'), 'outline_width': str(spec.get('width', 0.5))})",
    "        layer.setRenderer(QgsSingleSymbolRenderer(symbol))",
    "    set_layer_label(layer, spec.get('label', ''), 6 if layer.name().startswith('routes_') else 7)",
    "    layer.triggerRepaint()",
    "",
    "loaded_layers = []",
    "layers_by_name = {}",
    "for filename in layer_order:",
    "    path = layers_dir / filename",
    "    if not path.exists():",
    "        continue",
    "    layer = QgsVectorLayer(str(path), filename.replace('.geojson', ''), 'ogr')",
    "    if not layer.isValid():",
    "        print(f'WARNING: Layer did not load: {path}')",
    "        continue",
    "    apply_layer_style(layer)",
    "    project.addMapLayer(layer)",
    "    loaded_layers.append(layer)",
    "    layers_by_name[layer.name()] = layer",
    "",
    "boundary = next((layer for layer in loaded_layers if layer.name() == 'boundary'), None)",
    "def layer_extent_in_project_crs(layer):",
    "    if not layer or layer.extent().isEmpty():",
    "        return None",
    "    source_crs = layer.crs()",
    "    dest_crs = project.crs()",
    "    extent = QgsRectangle(layer.extent())",
    "    if source_crs.isValid() and dest_crs.isValid() and source_crs != dest_crs:",
    "        transform = QgsCoordinateTransform(source_crs, dest_crs, project)",
    "        extent = transform.transformBoundingBox(extent)",
    "    return extent",
    "",
    "extent = layer_extent_in_project_crs(boundary) if boundary else None",
    "if not extent or extent.isEmpty():",
    "    extents = [layer_extent_in_project_crs(layer) for layer in loaded_layers if layer.featureCount() > 0]",
    "    extents = [item for item in extents if item and not item.isEmpty()]",
    "    if extents:",
    "        extent = QgsRectangle(extents[0])",
    "        for candidate in extents[1:]:",
    "            extent.combineExtentWith(candidate)",
    "",
    "if not extent or extent.isEmpty():",
    "    raise RuntimeError('No valid map extent found. Check the GeoJSON layers.')",
    "",
    "extent.scale(1.15)",
    "try:",
    "    iface.mapCanvas().setExtent(extent)",
    "    iface.mapCanvas().refresh()",
    "except Exception:",
    "    pass",
    "",
    "manager = project.layoutManager()",
    "for layout in list(manager.printLayouts()):",
    "    if layout.name().startswith('Alistra Job Pack'):",
    "        manager.removeLayout(layout)",
    "",
    "def get_layer(name):",
    "    layer = layers_by_name.get(name)",
    "    return layer if layer and layer.isValid() and layer.featureCount() > 0 else None",
    "",
    "def render_layers(names):",
    "    # QGIS layout layer order is top-to-bottom here, so OSM goes last.",
    "    result = [get_layer(name) for name in names]",
    "    result = [layer for layer in result if layer]",
    "    osm_layer = project.mapLayer(osm_layer_id) if osm_layer_id else None",
    "    if osm_layer and osm_layer.isValid():",
    "        result.append(osm_layer)",
    "    return result",
    "",
    "def combined_extent(names, fallback, scale=1.35):",
    "    extents = [layer_extent_in_project_crs(get_layer(name)) for name in names if get_layer(name)]",
    "    extents = [item for item in extents if item and not item.isEmpty()]",
    "    if not extents:",
    "        return QgsRectangle(fallback)",
    "    next_extent = QgsRectangle(extents[0])",
    "    for item in extents[1:]:",
    "        next_extent.combineExtentWith(item)",
    "    next_extent.scale(scale)",
    "    return next_extent",
    "",
    "def export_sheet(layout_name, pdf_name, sheet_title, layer_names, sheet_extent):",
    "    layout = QgsPrintLayout(project)",
    "    layout.initializeDefaults()",
    "    layout.setName('Alistra Job Pack - ' + layout_name)",
    "    page = layout.pageCollection().pages()[0]",
    "    page.attemptResize(QgsLayoutSize(297, 210, QgsUnitTypes.LayoutMillimeters))",
    "    manager.addLayout(layout)",
    "",
    "    def box(x, y, w, h, color='#ffffff', stroke='#0f172a'):\n        item = QgsLayoutItemLabel(layout)\n        item.setBackgroundEnabled(True)\n        item.setBackgroundColor(QColor(color))\n        item.attemptMove(QgsLayoutPoint(x, y, QgsUnitTypes.LayoutMillimeters))\n        item.attemptResize(QgsLayoutSize(w, h, QgsUnitTypes.LayoutMillimeters))\n        layout.addLayoutItem(item)\n        return item",
    "",
    "    def add_label(text, x, y, w, h, size=6, bold=False, color='#0f172a'):\n        label = QgsLayoutItemLabel(layout)\n        label.setText(text)\n        font = QFont('Arial')\n        font.setPointSizeF(float(size))\n        font.setBold(bold)\n        label.setFont(font)\n        label.setFontColor(QColor(color))\n        label.attemptMove(QgsLayoutPoint(x, y, QgsUnitTypes.LayoutMillimeters))\n        label.attemptResize(QgsLayoutSize(w, h, QgsUnitTypes.LayoutMillimeters))\n        layout.addLayoutItem(label)\n        return label",
    "",
    "    box(0, 0, 297, 210, '#ffffff')",
    "    box(5, 5, 287, 18, '#001326')",
    "    add_label('ALISTRA GIS', 10, 8, 55, 8, 11, True, '#ffffff')",
    "    add_label('ENGINEERING DELIVERY JOB PACK', 10, 18, 75, 4, 3.5, True, '#7dd3fc')",
    `    add_label('${safeProject}', 205, 8, 82, 5, 4.5, True, '#ffffff')`,
    `    add_label('${safeArea}', 205, 16, 82, 5, 4.0, True, '#ffffff')`,
    "",
    "    map_item = QgsLayoutItemMap(layout)",
    "    layout.addLayoutItem(map_item)",
    "    map_item.attemptMove(QgsLayoutPoint(5, 26, QgsUnitTypes.LayoutMillimeters))",
    "    map_item.attemptResize(QgsLayoutSize(262, 178, QgsUnitTypes.LayoutMillimeters))",
    "    map_item.setExtent(sheet_extent)",
    "    map_item.setFrameEnabled(True)",
    "    map_item.setLayers(render_layers(layer_names))",
    "",
    "    box(270, 26, 22, 178, '#ffffff')",
    "    add_label('SHEET', 272, 30, 18, 5, 4.5, True)",
    "    add_label(sheet_title, 272, 38, 18, 14, 3.2, True)",
    "    add_label('BP REVIEW', 272, 58, 18, 5, 3.5, True)",
    "    add_label('Draft', 272, 65, 18, 5, 3.2, False)",
    "    add_label('LEGEND', 272, 80, 18, 5, 4.0, True)",
    "    add_label('Purple Boundary\\nBlue 96F\\nCyan 48F/36F\\nAmber 24F\\nOrange 12F\\nYellow DP\\nPink Joint\\nGrey Chamber\\nWhite Pole', 272, 88, 19, 49, 2.8, False)",
    "",
    "    logo_path = layout_dir / 'alistra-gis-logo.svg'",
    "    if logo_path.exists():",
    "        logo = QgsLayoutItemPicture(layout)",
    "        logo.setPicturePath(str(logo_path))",
    "        logo.attemptMove(QgsLayoutPoint(271, 170, QgsUnitTypes.LayoutMillimeters))",
    "        logo.attemptResize(QgsLayoutSize(19, 18, QgsUnitTypes.LayoutMillimeters))",
    "        layout.addLayoutItem(logo)",
    "    else:",
    "        add_label('ALISTRA\\nGIS', 272, 172, 18, 15, 5, True, '#0284c7')",
    "",
    "    add_label('Homes plotted without UPRN labels. Routes and fibre allocations to be reviewed before issue.', 8, 205, 245, 4, 3, False, '#475569')",
    "",
    "    pdf_path = output_dir / pdf_name",
    "    exporter = QgsLayoutExporter(layout)",
    "    result = exporter.exportToPdf(str(pdf_path), QgsLayoutExporter.PdfExportSettings())",
    "    if result != QgsLayoutExporter.Success:",
    "        raise RuntimeError(f'PDF export failed for {sheet_title} with QGIS result code {result}')",
    "    print(f'Exported {sheet_title}: {pdf_path}')",
    "    return pdf_path",
    "",
    "context_names = ['dps', 'joints', 'chambers', 'poles']",
    "overview_names = ['homes', 'dps', 'joints', 'chambers', 'poles', 'drops', 'routes_12F', 'routes_24F', 'routes_36F', 'routes_48F', 'routes_96F', 'route_context', 'boundary']",
    `export_sheet('00 Overview', '00_Overview_${safePdfName}', 'Area Overview', overview_names, extent)`,
    "",
    "route_pages = [",
    "    ('01 96F', '01_96F_Routes.pdf', '96F Route Page', 'routes_96F'),",
    "    ('02 48F', '02_48F_Routes.pdf', '48F Route Page', 'routes_48F'),",
    "    ('03 36F', '03_36F_Routes.pdf', '36F Route Page', 'routes_36F'),",
    "    ('04 24F', '04_24F_Routes.pdf', '24F Route Page', 'routes_24F'),",
    "    ('05 12F', '05_12F_Routes.pdf', '12F Route Page', 'routes_12F'),",
    "]",
    "for layout_name, pdf_name, title, route_layer_name in route_pages:",
    "    route_layer = get_layer(route_layer_name)",
    "    if not route_layer:",
    "        continue",
    "    route_extent = combined_extent([route_layer_name], extent, 1.35)",
    "    page_layers = context_names + [route_layer_name, 'boundary']",
    "    export_sheet(layout_name, pdf_name, title, page_layers, route_extent)",
    "",
    "project_path = output_dir / 'Alistra_Job_Pack_Project.qgz'",
    "project.write(str(project_path))",
    "print(f'QGIS project saved: {project_path}')",
  ].join("\n");
}

function qgisMetadata(draft: JobPackDraft): string {
  return JSON.stringify({
    id: draft.id,
    areaId: draft.areaId,
    areaName: draft.areaName,
    packNumber: draft.packNumber,
    revision: draft.revision,
    status: draft.status,
    generatedAt: draft.generatedAt,
    source: draft.source,
    summary: draft.summary,
    routes: draft.routes.map((route) => ({
      id: route.id,
      title: route.title,
      fibreCount: route.fibreCount,
      installMethod: route.installMethod,
      reviewStatus: route.reviewStatus,
      assetCount: route.assets.length,
    })),
  }, null, 2);
}

export async function createQgisJobPackBundleBlob(draft: JobPackDraft): Promise<Blob> {
  const base = `${draft.packNumber}-QGIS`;
  const [logoSvg, legendSvg, layoutSvg, layoutReadme] = await Promise.all([
    publicAssetText("/qgis-assets/alistra-gis-logo.svg"),
    publicAssetText("/qgis-assets/alistra-job-pack-legend.svg"),
    publicAssetText("/qgis-assets/alistra-a3-job-pack-layout.svg"),
    publicAssetText("/qgis-assets/README-QGIS-LAYOUT.txt"),
  ]);
  const assets = draft.assets.filter((asset) => asset.geometry);
  const byGroup = (group: JobPackDraftAsset["group"]) => assets.filter((asset) => asset.group === group);
  const routeAssets = byGroup("route");
  const files = [
    { path: `${base}/00_READ_ME_FIRST.txt`, content: readme(draft) },
    { path: `${base}/00_Metadata/job-pack.json`, content: qgisMetadata(draft) },
    { path: `${base}/01_Layers/boundary.geojson`, content: collection(byGroup("boundary"), draft) },
    { path: `${base}/01_Layers/dps.geojson`, content: collection(byGroup("distributionPoint"), draft) },
    { path: `${base}/01_Layers/joints.geojson`, content: collection(byGroup("joint"), draft) },
    { path: `${base}/01_Layers/chambers.geojson`, content: collection(byGroup("chamber"), draft) },
    { path: `${base}/01_Layers/poles.geojson`, content: collection(byGroup("pole"), draft) },
    { path: `${base}/01_Layers/homes.geojson`, content: collection(byGroup("home"), draft) },
    { path: `${base}/01_Layers/route_context.geojson`, content: collection(routeAssets, draft) },
    ...routeCounts.map((count) => ({
      path: `${base}/01_Layers/routes_${count}.geojson`,
      content: collection(routeAssets.filter((asset) => asset.fibreCount === count), draft),
    })),
    { path: `${base}/01_Layers/drops.geojson`, content: collection(routeAssets.filter((asset) => /drop/i.test(`${asset.name} ${asset.cableType} ${asset.notes}`)), draft) },
    { path: `${base}/02_QGIS_Styles/boundary.qml`, content: polygonStyle("Project Boundary", "150,82,225,45", "150,82,225,255", 0.7) },
    { path: `${base}/02_QGIS_Styles/routes_96F.qml`, content: routeStyle("96F Routes", "37,99,235,255", 0.75, true) },
    { path: `${base}/02_QGIS_Styles/routes_48F.qml`, content: routeStyle("48F Routes", "6,182,212,255", 0.65, true) },
    { path: `${base}/02_QGIS_Styles/routes_36F.qml`, content: routeStyle("36F Routes", "14,165,233,255", 0.6, true) },
    { path: `${base}/02_QGIS_Styles/routes_24F.qml`, content: routeStyle("24F Routes", "245,158,11,255", 0.55, true) },
    { path: `${base}/02_QGIS_Styles/routes_12F.qml`, content: routeStyle("12F Routes", "249,115,22,255", 0.5, true) },
    { path: `${base}/02_QGIS_Styles/route_context.qml`, content: routeStyle("Route Context", "15,23,42,160", 0.35, true) },
    { path: `${base}/02_QGIS_Styles/drops.qml`, content: routeStyle("Drop Fibre", "34,197,94,200", 0.25) },
    { path: `${base}/02_QGIS_Styles/dps.qml`, content: pointStyle("DPs", "255,211,0,255", 2.6) },
    { path: `${base}/02_QGIS_Styles/joints.qml`, content: pointStyle("Joints", "236,72,153,255", 2.4, "diamond") },
    { path: `${base}/02_QGIS_Styles/chambers.qml`, content: pointStyle("Chambers", "107,114,128,255", 2.5, "square") },
    { path: `${base}/02_QGIS_Styles/poles.qml`, content: pointStyle("Poles", "255,255,255,255", 2.2) },
    { path: `${base}/02_QGIS_Styles/homes.qml`, content: pointStyle("Homes", "249,115,22,180", 1.4, "square") },
    { path: `${base}/03_Schedules/DP_Schedule.csv`, content: scheduleCsv(draft.dpSchedule) },
    { path: `${base}/03_Schedules/Homes_Schedule.csv`, content: scheduleCsv(draft.homesSchedule) },
    { path: `${base}/03_Schedules/Fibre_Allocation.csv`, content: scheduleCsv(draft.fasRows) },
    { path: `${base}/04_QGIS_Layout/README-QGIS-LAYOUT.txt`, content: layoutReadme },
    { path: `${base}/04_QGIS_Layout/alistra-gis-logo.svg`, content: logoSvg },
    { path: `${base}/04_QGIS_Layout/alistra-job-pack-legend.svg`, content: legendSvg },
    { path: `${base}/04_QGIS_Layout/alistra-a3-job-pack-layout.svg`, content: layoutSvg },
    { path: `${base}/05_Automation/RUN_ME_IN_QGIS.txt`, content: qgisAutomationReadme(draft) },
    { path: `${base}/05_Automation/export_job_pack_pdf.py`, content: qgisAutomationScript(draft) },
  ];
  return buildZip(files);
}

export async function exportQgisJobPackBundle(draft: JobPackDraft): Promise<string> {
  const blob = await createQgisJobPackBundleBlob(draft);
  const url = URL.createObjectURL(blob);
  const filename = `${draft.packNumber}-QGIS.zip`;
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  return filename;
}
