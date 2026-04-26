// src/logic/jointConfig.ts

export type JointTypeLabel =
  | "CMJ (12 trays)"
  | "MMJ (20 trays)"
  | "LMJ (40 trays)";

// Whatever else you already have in this file:
export const JOINT_TYPES = {
  "CMJ (12 trays)": { trays: 12, fibresPerTray: 12 },
  "MMJ (20 trays)": { trays: 20, fibresPerTray: 12 },
  "LMJ (40 trays)": { trays: 40, fibresPerTray: 12 },
};

// Your existing function:
export function buildJoint(type: JointTypeLabel) {
  const cfg = JOINT_TYPES[type];
  const out = [];
  let counter = 1;

  for (let tray = 0; tray < cfg.trays; tray++) {
    for (let pos = 0; pos < cfg.fibresPerTray; pos++) {
      out.push({
        tray,
        pos,
        globalNo: counter++,
        label: "",
      });
    }
  }

  return out;
}

export type FibreCell = ReturnType<typeof buildJoint>[number];
