import chassisOverview from "./overview.png";
import driveBays from "./drivebay.png";
import { ServerModel } from '@/serverModels';

export default {
  imageURLs: {
    chassisOverview,
    driveBays,
  },
  slotLocations: [
    { name: "1-1", x: 9 + 30/2, y: 33 + 118/2, type: "HDD", rotation: 0 },
    { name: "1-2", x: 41 + 30/2, y: 33 + 118/2, type: "HDD", rotation: 0 },
    { name: "1-3", x: 72 + 30/2, y: 33 + 118/2, type: "HDD", rotation: 0 },
    { name: "1-4", x: 104 + 30/2, y: 33 + 118/2, type: "HDD", rotation: 0 },
  ],
} as ServerModel;
