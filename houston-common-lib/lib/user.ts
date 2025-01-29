import { Directory, File } from "@/path";
import { Server } from "@/server";
import { useSpawn, errorString } from '@/legacy/useSpawn';

export type User = {
	server: Server;
	login?: string;
	uid: number;
	gid?: number;
	name?: string;
	home?: Directory;
	shell?: File;
};

export type LocalUser = Required<User>;

export function User(
	server: Server,
	login: string | undefined,
	uid: number,
	gid: number | undefined,
	name: string | undefined,
	home: Directory | undefined,
	shell: File | undefined
): User {
	return {
		server,
		login,
		uid,
		gid,
		name,
		home,
		shell,
	};
}

export function isLocalUser(user: User): user is LocalUser {
	return [user.login, user.gid, user.name, user.home, user.shell].every(
		(prop) => prop !== undefined
	);
}

/**
 * Validates user input for adding a new user.
 * @param {object} user - The user details to validate.
 * @param {string[]} existingUsers - A list of existing usernames.
 * @returns {object} - Errors object, empty if valid.
 */
export function validateNewUser(userName: string , existingUsers: string[]) {
	if (!userName) {
		return 'Username is required.';
	}
	if (existingUsers.includes(userName)) {
		return `User ${userName} already exists.`;
	}
	return null;
}

/**
 * Generates default fields for a new user.
 * @param {string} username - The username.
 * @returns {object} - Default values (e.g., home directory, primary group).
 */
export function getDefaultUserFields(username: string) {
	return {
		home: `/home/${username}`,
		primaryGroup: username,
	};
}

/**
 * Sets a password for a user.
 * @param {string} username - The username.
 * @param {string} password - The password to set.
 * @returns {Promise<object>} - Success or error message.
 */
export async function setNewPassword(username: string, password: string) {
	try {
		// const state = useSpawn(['passwd', username], { superuser: 'try' });
		// state.proc.input(`${password}\n${password}\n`);
		// await state.promise();
		await useSpawn(['bash', '-c', `echo -e "${password}\n${password}" | passwd ${username}`], { superuser: 'try' }).promise();
		return { success: true, message: `Password set for user ${username}.` };
	} catch (error) {
		throw new Error(`Failed to set password for user ${username}: ${errorString(error)}`);
	}
}

/**
 * Adds a new user.
 * @param {object} user - The user details.
 * @param {string[]} existingUsers - A list of existing usernames.
 * @param {string[]} existingGroups - A list of existing group names.
 * @returns {Promise<object>} - Success or error message.
 */
export async function addUser(
	user: {
		user: string; home?: string; shell?: {
			path: string, name: string, isShellObj: boolean, isCustom: boolean
		};
		groups?: string[]; password?: string, name?: string, primaryGroup?: string
	},
	existingUsers: string[],
) {
	try {
		const validationError = validateNewUser(user.user, existingUsers);
		if (validationError) {
			console.warn("Validation error:", validationError);
			return { success: false, error: validationError };
		}

		const defaults = getDefaultUserFields(user.user);
		const argv = ['useradd', '-m'];

		if (user.name) argv.push('--comment', user.name);
		if (user.home) argv.push('--home', user.home || defaults.home);
		argv.push('--user-group');
		if (user.groups?.length) argv.push('--groups', user.groups.join(','));
		if (user.shell) argv.push('-s', user.shell.path);
		argv.push(user.user);

		// console.log("Executing useradd with arguments:", argv);

		await useSpawn(argv, { superuser: 'try' }).promise();
		// console.log("User successfully added:", user.user);
		return { success: true, message: `User ${user.user} added successfully.` };
	} catch (error) {
		console.error("Failed to add user:", user.user, error);
		return { success: false, error: `Failed to add user '${user.user}': ${errorString(error)}` };
	}
}


/**
 * Fetches a list of system users.
 * @returns {Promise<object[]>} - A list of user objects with details.
 */
export async function getUsers(): Promise<{ user: string; name: string; uid: number; currentLoggedIn: boolean }[]> {
	try {
		const currentLoggedInUser = (await cockpit.user()).name; // Get the current user
		const state = useSpawn(['getent', 'passwd'], { superuser: 'try' });
		const passwdOutput = (await state.promise()).stdout;

		const users = passwdOutput!
			.split('\n')
			.map((record) => {
				if (/^\s*$/.test(record)) return null; // Skip empty lines
				const fields = record.split(':');
				const uid = fields[2];
				const uidInt = parseInt(uid || '', 10); // Ensure we handle undefined cases
				if (isNaN(uidInt) || (uidInt < 1000 && uidInt !== 0)) return null; // Filter out system users

				const user = fields[0] || ''; // Default to empty string if undefined
				const name = fields[4] || user; // Use username if name field is empty

				return {
					user,
					name,
					uid: uidInt,
					currentLoggedIn: user === currentLoggedInUser,
				};
			})
			.filter((user): user is { user: string; name: string; uid: number; currentLoggedIn: boolean } => user !== null); // Type guard to filter out nulls
		return users;
	} catch (error) {
		throw new Error(`Failed to fetch users: ${ errorString(error) }`);
	}
}
