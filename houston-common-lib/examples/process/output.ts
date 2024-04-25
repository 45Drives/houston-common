import { process } from '@45drives/cockpit-helpers';

async function getSystemUsers() {
	const rawGetent = await process.exec(['getent', 'passwd']).output;
	return rawGetent.trim().split('\n')
		.map(record => {
		const [name, _hash, uid, gid, comment, home, shell] = record.split(':');
		return {
			name,
			uid,
			gid,
			comment,
			home,
			shell
		}
	})
}
