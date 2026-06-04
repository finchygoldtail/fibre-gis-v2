import React, { useRef, useState } from "react";

type Props = {
  onChange?: (signature: string) => void;
};

function getPointerPosition(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: ((clientX - rect.left) / rect.width) * canvas.width,
    y: ((clientY - rect.top) / rect.height) * canvas.height,
  };
}

export default function AuditSignaturePad({ onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);

  const startDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.currentTarget.setPointerCapture(e.pointerId);

    const pos = getPointerPosition(canvas, e.clientX, e.clientY);

    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";

    setDrawing(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pos = getPointerPosition(canvas, e.clientX, e.clientY);

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();

    setHasSignature(true);
  };

  const stopDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e?.currentTarget && e.pointerId !== undefined) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture can already be released by the browser.
      }
    }

    setDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas || !hasSignature) return;

    onChange?.(canvas.toDataURL("image/png"));
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange?.("");
  };

  return (
    <div style={section}>
      <h3 style={heading}>Signature</h3>
      <div style={hint}>Sign inside the white box before saving the audit.</div>

      <canvas
        ref={canvasRef}
        width={900}
        height={260}
        style={canvasStyle}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />

      <div style={buttonRow}>
        <button type="button" style={clearButton} onClick={clearSignature}>
          Clear Signature
        </button>

        <span style={hasSignature ? signedPill : unsignedPill}>
          {hasSignature ? "Signature captured" : "No signature yet"}
        </span>
      </div>
    </div>
  );
}

const section: React.CSSProperties = {
  marginTop: 16,
  padding: 12,
  background: "#0b1220",
  border: "1px solid rgba(148,163,184,0.18)",
  borderRadius: 8,
};

const heading: React.CSSProperties = {
  margin: "0 0 6px",
  fontSize: 16,
};

const hint: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
  marginBottom: 10,
};

const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: 180,
  border: "1px solid #374151",
  background: "#ffffff",
  borderRadius: 6,
  cursor: "crosshair",
  touchAction: "none",
};

const buttonRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  marginTop: 8,
};

const clearButton: React.CSSProperties = {
  border: "1px solid rgba(148,163,184,0.3)",
  background: "#111827",
  color: "#f8fafc",
  borderRadius: 6,
  padding: "7px 10px",
  cursor: "pointer",
};

const unsignedPill: React.CSSProperties = {
  color: "#fbbf24",
  fontSize: 12,
  fontWeight: 800,
};

const signedPill: React.CSSProperties = {
  color: "#86efac",
  fontSize: 12,
  fontWeight: 800,
};
