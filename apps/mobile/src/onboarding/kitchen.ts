import type { Method } from "@pantry/contract";

/**
 * Where each appliance sits in `assets/kitchen.webp` (1536×1536), as
 * fractions of the image, so the tap areas scale with it. `label` says where
 * the name goes: under the appliance, or above it for the cooktop, which has
 * the oven right below. Measured by eye from the image; redo these if the
 * image changes.
 */
export const KITCHEN_SPOTS: Record<Method, { x: number; y: number; w: number; h: number; label: "below" | "above"; wide?: boolean }> = {
  fridge: { x: 0.065, y: 0.052, w: 0.231, h: 0.361, label: "below" },
  freezer: { x: 0.352, y: 0.16, w: 0.241, h: 0.238, label: "below" },
  stove: { x: 0.661, y: 0.104, w: 0.28, h: 0.075, label: "above" },
  oven: { x: 0.664, y: 0.189, w: 0.273, h: 0.28, label: "below" },
  microwave: { x: 0.065, y: 0.459, w: 0.277, h: 0.163, label: "below" },
  air_fryer: { x: 0.423, y: 0.466, w: 0.218, h: 0.208, label: "below" },
  kettle: { x: 0.726, y: 0.55, w: 0.182, h: 0.186, label: "below" },
  blender: { x: 0.114, y: 0.664, w: 0.182, h: 0.293, label: "below" },
  // Its name needs more room than the pot is wide; there's empty space either side.
  rice_cooker: { x: 0.394, y: 0.726, w: 0.241, h: 0.215, label: "below", wide: true },
};
