/// <reference path="./cockpit.d.ts" />
/// <reference path="./cockpit-extra.d.ts" />

import { default as CockpitModule } from "cockpit";

declare global {
  var cockpit: typeof CockpitModule;
}
