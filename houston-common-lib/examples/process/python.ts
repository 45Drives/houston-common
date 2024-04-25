import { process } from '@45drives/cockpit-helpers';
import script_py from './script.py?raw';

async function runScript() {
	return await process.python(script_py);
}
