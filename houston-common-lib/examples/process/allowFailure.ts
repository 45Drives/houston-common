import { process } from '@45drives/cockpit-helpers';

async function nukeSystem() {
	const result = await process.exec(['rm', '-rf', '/'], { throwIfFailure: false });
	// check exit code to see if there were errors
	if (result.exitCode !== 0)
		console.error(`I'm sorry, Dave. I'm afraid I can't do that.`);
}
