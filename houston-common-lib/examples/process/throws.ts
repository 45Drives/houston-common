import { process } from '@45drives/cockpit-helpers';

async function nukeSystem() {
	try {
		await process.exec(['rm', '-rf', '/']);
	} catch (error) {
		console.error(`I'm sorry, Dave. I'm afraid I can't do that.`);
	}
}
