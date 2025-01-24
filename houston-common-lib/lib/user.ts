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
 * @param {string[]} existingGroups - A list of existing group names.
 * @returns {object} - Errors object, empty if valid.
 */
export function validateNewUser(user: { username: string; groups?: string[] }, existingUsers: string[], existingGroups: string[]) {
  const errors: Record<string, string> = {};
  if (!user.username || user.username.length < 3) {
    errors.username = 'Username must be at least 3 characters long.';
  }
  if (existingUsers.includes(user.username)) {
    errors.username = 'This username already exists.';
  }
  if (user.groups?.some((group) => !existingGroups.includes(group))) {
    errors.groups = 'Some groups are invalid.';
  }
  return errors;
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
export async function setPassword(username: string, password: string) {
  try {
    const state = useSpawn(['passwd', username], { superuser: 'try' });
    state.proc.input(`${password}\n${password}\n`);
    await state.promise();
    return { success: true, message: `Password set for user ${username}.` };
  } catch (error) {
    throw new Error(`Failed to set password for user ${username}: ${errorString(error)}`);
  }
}

/**
 * Adds a new user and optionally sets a password.
 * @param {object} user - The user details.
 * @param {string[]} existingUsers - A list of existing usernames.
 * @param {string[]} existingGroups - A list of existing group names.
 * @returns {Promise<object>} - Success or error message.
 */
export async function addUser(
  user: { username: string; home?: string; shell?: string; groups?: string[]; password?: string },
  existingUsers: string[],
  existingGroups: string[]
) {
  const errors = validateNewUser(user, existingUsers, existingGroups);
  if (Object.keys(errors).length > 0) {
    return { success: false, errors };
  }

  const defaults = getDefaultUserFields(user.username);
  const argv = ['useradd', '-m', user.username];
  argv.push('--home', user.home || defaults.home);
  argv.push('--user-group');
  if (user.shell) argv.push('-s', user.shell);
  if (user.groups?.length) argv.push('--groups', user.groups.join(','));

  try {
    await useSpawn(argv, { superuser: 'try' }).promise();
    if (user.password) {
      await setPassword(user.username, user.password);
    }
    return { success: true, message: `User ${user.username} added successfully.` };
  } catch (error) {
    throw new Error(`Failed to add user: ${errorString(error)}`);
  }
}