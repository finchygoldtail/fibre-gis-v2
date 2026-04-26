import React, { useState, useMemo } from "react";
import Tree from "react-d3-tree";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

/* -----------------------------------------------------------
   FIBRE COLOUR CODE
----------------------------------------------------------- */
const fibreColours = [
  "#0000FF", "#FFA500", "#008000", "#8B4513",
  "#708090", "#FFFFFF", "#FF0000", "#000000",
  "#FFFF00", "#8A2BE2", "#FF1493", "#00FFFF"
];
const getFibreColour = (n) =>
  fibreColours[(parseInt(n) - 1) % 12] || "#ccc";

/* -----------------------------------------------------------
   Convert ARRAY rows → OBJECT rows (critical fix)
----------------------------------------------------------- */
function normaliseRow(row) {
  const out = {
    "Link Cable": row[0],
    "Link Fibre": row[1],
    "Cable Name": row[2],
    "Fibre": row[3],
    "End Point": row[4],
  };

  // dynamic extra hops
  let hop = 1;
  let idx = 5;

  while (idx + 2 < row.length) {
    out[`Cable Name.${hop}`] = row[idx];
    out[`Fibre.${hop}`] = row[idx + 1];
    out[`End Point.${hop}`] = row[idx + 2];
    hop++;
    idx += 3;
  }

  return out;
}

/* -----------------------------------------------------------
   NODE TYPE DETECTION
----------------------------------------------------------- */
function classifyNode(name) {
  if (!name) return { type: "unknown" };

  if (/LC\d+/i.test(name)) return { type: "joint" };
  if (/SB\d+/i.test(name) && /SP\d+/i.test(name))
    return { type: "splitter-port" };
  if (/SB\d+/i.test(name)) return { type: "splitter" };
  if (/FUL|AG\d+/i.test(name)) return { type: "cable" };
  if (!isNaN(parseInt(name))) return { type: "fibre" };

  return { type: "unknown" };
}

function getNodeColour(node) {
  switch (node.type) {
    case "joint": return "#4a90e2";
    case "splitter": return "#e6c229";
    case "splitter-port": return "#38a169";
    case "cable": return "#f97316";
    case "fibre": return getFibreColour(node.fibreNumber);
    default: return "#999";
  }
}

/* -----------------------------------------------------------
   BUILD TREE
----------------------------------------------------------- */
function ensureChild(parent, name, extra = {}) {
  const t = classifyNode(name);
  let existing = parent.children.find((c) => c.name === name);
  if (existing) return existing;

  const node = {
    name,
    type: t.type,
    ...extra,
    children: []
  };
  parent.children.push(node);
  return node;
}

function buildTree(rawRows) {
  const root = { name: "Network", children: [] };

  for (const raw of rawRows) {
    const row = normaliseRow(raw); // <<<<<< KEY FIX

    if (!row["Link Cable"]) continue;

    let parent = root;

    // Joint
    parent = ensureChild(parent, row["Link Cable"]);

    // Fibre
    parent = ensureChild(parent, String(row["Link Fibre"]), {
      type: "fibre",
      fibreNumber: row["Link Fibre"]
    });

    // Multi-hop chain
    let hop = 0;
    while (true) {
      const cable = row[hop === 0 ? "Cable Name" : `Cable Name.${hop}`];
      const fibre = row[hop === 0 ? "Fibre" : `Fibre.${hop}`];
      const end = row[hop === 0 ? "End Point" : `End Point.${hop}`];

      if (!cable || !fibre || !end) break;

      parent = ensureChild(parent, cable, { type: "cable" });

      parent = ensureChild(parent, String(fibre), {
        type: "fibre",
        fibreNumber: fibre
      });

      parent = ensureChild(parent, end);

      hop++;
      if (hop > 15) break;
    }
  }

  return root;
}

/* -----------------------------------------------------------
   MAIN COMPONENT
----------------------------------------------------------- */
export default function NetworkTreeView({ mappingRows }) {
  const [search, setSearch] = useState("");

  const data = useMemo(() => buildTree(mappingRows), [mappingRows]);

  function highlight(node) {
    const match =
      search &&
      node.name.toLowerCase().includes(search.toLowerCase());

    const out = { ...node, highlighted: match };

    if (node.children)
      out.children = node.children.map(highlight);

    return out;
  }

  const treeData = search ? highlight(data) : data;

  const exportPDF = async () => {
    const el = document.getElementById("tree-container");
    const canvas = await html2canvas(el);
    const img = canvas.toDataURL("image/png");

    const pdf = new jsPDF("landscape", "pt", "a4");
    pdf.addImage(img, "PNG", 0, 0);
    pdf.save("network.pdf");
  };

  return (
    <div style={{ width: "100%", height: "100%", background: "#fff" }}>
      <div style={{ padding: 10 }}>
        <input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 260,
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid #666"
          }}
        />
        <button
          onClick={exportPDF}
          style={{
            marginLeft: 10,
            padding: "6px 12px",
            borderRadius: 4,
            background: "#3b82f6",
            color: "white"
          }}
        >
          Export PDF
        </button>
      </div>

      <div
        id="tree-container"
        style={{ width: "100%", height: "90%", overflow: "auto" }}
      >
        <Tree
  data={treeData}
  orientation="horizontal"
  translate={{ x: 200, y: 300 }}
  zoom={0.8}

  // Make nodes much more spaced out
  nodeSize={{ x: 250, y: 80 }}

  separation={{ 
    siblings: 2.5, 
    nonSiblings: 3.2 
  }}

  // Much smoother links
  pathFunc="diagonal"

  collapsible={true}

  nodeSvgShape={{
    shape: "circle",
    shapeProps: {
      r: 12,
      stroke: "#333",
      strokeWidth: 2,
      fill: (node) =>
        node.data.highlighted
          ? "#00ff00"
          : getNodeColour(node.data)
    }
  }}

  styles={{
    links: { stroke: "#555", strokeWidth: 1.5 },
    nodes: {
      node: { name: { fill: "#222" } },
      leafNode: { name: { fill: "#222" } }
    }
  }}
/>

      </div>
    </div>
  );
}
