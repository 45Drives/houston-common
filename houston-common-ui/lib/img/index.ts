import * as hl4 from "./hl4"
import * as q30 from "./q30"
import * as f8x1 from "./f8x1"
import * as fallback from './fallback';
import * as branding_logos from './branding';

const model_number_LUT: [ RegExp, typeof hl4] []  = [
    [ /^(Storinator|Destroyinator)-(H8-|H16-|H32-)?Q30/, q30 ],
    [ /^HomeLab-HL4/, hl4],
    [/^Storinator-F8X1/, f8x1]
]

export function lookupImages(modelNumber: string): typeof hl4 {
    for (const [regex, imageGroup] of model_number_LUT) {
        if (regex.test(modelNumber)) {
            return imageGroup;
        }
    }

    return fallback;
}

export { default as houstonPortrait } from './houston.png'
export { branding_logos };