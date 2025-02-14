import hl4 from "./img/hl4";
import q30 from "./img/q30";

export type SlotType = "HDD" | "SSD_15mm" | "SSD_7mm";

export type ServerModel = {
  modelNumber: string;
  imageURLs: {
    chassisOverview: string;
    driveBays: string;
  };
  slotLocations: {
    name: string;
    x: number;
    y: number;
    type: SlotType;
    rotation: number;
  }[];
};

const model_number_LUT: [RegExp, Omit<ServerModel, "modelNumber">][] = [
  [/^(Storinator|Destroyinator)-(H8-|H16-|H32-)?Q30/, q30],
  [/^HomeLab-HL4/, hl4],
];

export function lookupServerModel(modelNumber: string): ServerModel | null {
  for (const [regex, model] of model_number_LUT) {
    if (regex.test(modelNumber)) {
      return {
        ...model,
        modelNumber: modelNumber,
      };
    }
  }

  return null;
}
