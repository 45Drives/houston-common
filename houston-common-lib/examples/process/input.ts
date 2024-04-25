import { process } from '@45drives/cockpit-helpers';

async function writeFileSync(data: string, path: string) {
	const proc = process.exec(['dd', `of=${path}`]);
	proc.input(data);
	proc.closeSTDIN();
	await proc;
}

// chained
const writeFileSync2 = async (data: string, path: string) =>
	await process.exec(['dd', `of=${path}`]).input(data).closeSTDIN();
