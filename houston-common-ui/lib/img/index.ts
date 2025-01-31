import * as hl4 from "./hl4"
import * as q30 from "./q30"
import * as fallback from './fallback';

const model_number_LUT: [ RegExp, typeof hl4] []  = [
    [ /^(Storinator|Destroyinator)-(H8-|H16-|H32-)?Q30/, q30 ],
    [ /^HomeLab-HL4/, hl4]
]

export function lookupImages(modelNumber: string): typeof hl4 {
    for (const [regex, imageGroup] of model_number_LUT) {
        if (regex.test(modelNumber)) {
            return imageGroup;
        }
    }

    return fallback;
}