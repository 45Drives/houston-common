import { Server } from "@/server";
import { useSpawn, errorString } from '@/legacy/useSpawn';

export type Group = {
	server: Server;
	name?: string;
	gid: number;
	members?: string[];
};

export type LocalGroup = Required<Group>;

export function Group(
	server: Server,
	name: string | undefined,
	gid: number,
	members: string[] | undefined
): Group {
	return {
		server,
		name,
		gid,
		members,
	};
}

export function isLocalGroup(group: Group): group is LocalGroup {
	return [group.name, group.members].every((prop) => prop !== undefined);
}

/**
 * Validates the group name before creation.
 * @param {string} groupName - The name of the group to validate.
 * @param {string[]} existingGroups - A list of existing group names.
 * @returns {string | null} - An error message if invalid, otherwise `null`.
 */
function validateNewGroup(groupName: string, existingGroups: string[]): string | null {
	if (!groupName || groupName.length < 3) {
		return 'Group name must be at least 3 characters long.';
	}
	if (existingGroups.includes(groupName)) {
		return `Group '${groupName}' already exists.`;
	}
	return null;
}

/**
 * Creates a new group on the system.
 * @param {string} groupName - The name of the group to create.
 * @param {string[]} existingGroups - A list of existing group names.
 * @returns {Promise<object>} - Success or error message.
 */
export async function createNewGroup(groupName: string, existingGroups: string[]) {
	const validationError = validateNewGroup(groupName, existingGroups);
	if (validationError) {
		return { success: false, error: validationError };
	}

	try {
		await useSpawn(['groupadd', groupName], { superuser: 'try' }).promise();
		return { success: true, message: `Group '${groupName}' created successfully.` };
	} catch (error) {
		throw new Error(`Failed to create group '${groupName}': ${errorString(error)}`);
	}
}


/**
 * Fetches all system groups and their members.
 * @returns {Promise<object[]>} - A list of groups with their details.
 */
export async function getGroups() {
	try {
		const primaryGroupsOutput = await useSpawn(['getent', 'passwd'], { superuser: 'try' }).promise();
		const primaryGroups = primaryGroupsOutput.stdout!
			.split('\n')
			.filter(line => !/^\s*$/.test(line))
			.map(record => {
				const [user, _pass, _uid, gid] = record.split(':');
				
				return { gid: parseInt(gid!), user };
			});

		const groupDBOutput = await useSpawn(['getent', 'group'], { superuser: 'try' }).promise();
		const groups = groupDBOutput.stdout!
			.split('\n')
			.filter(record => !/^\s*$/.test(record))
			.map(record => {
				const [groupName, _, gid, members] = record.split(':');
				const group: any = {
					group: groupName,
					name: groupName,
					gid: parseInt(gid!),
					members: members ? members.split(',').filter(Boolean) : [],
				};
				const primaryGroup = primaryGroups.find(g => g.gid === group.gid);
				if (primaryGroup) {
					group.isPrimary = true;
					group.primaryMember = primaryGroup.user;
					group.members = [...new Set([...group.members, primaryGroup.user])];
				}
				return group;
			});

		return groups;
	} catch (error) {
		throw new Error(`Failed to fetch groups: ${errorString(error)}`);
	}
}

