/* Copyright (C) 2022 Josh Boudreau <jboudreau@45drives.com>
 * 
 * This file is part of 45Drives NPM Repository.
 * 
 * 45Drives NPM Repository is free software: you can redistribute it and/or modify it under the terms
 * of the GNU General Public License as published by the Free Software Foundation, either version 3
 * of the License, or (at your option) any later version.
 * 
 * 45Drives NPM Repository is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License along with 45Drives NPM Repository.
 * If not, see <https://www.gnu.org/licenses/>. 
 */

import { useSpawn, errorString } from '@45drives/cockpit-helpers';

async function getFingerprint(pubKey) {
	let tmpFile, result;
	try {
		tmpFile = (await useSpawn(['mktemp'], { superuser: 'try' }).promise()).stdout.trim();
		const ddState = useSpawn(['dd', `of=${tmpFile}`], { superuser: 'try' });
		ddState.proc.input(pubKey);
		await ddState.promise();
		result = (await useSpawn(['ssh-keygen', '-l', '-f', tmpFile], { superuser: 'try' }).promise()).stdout
			.split(' ')[1]
	} catch (state) {
		result = "Failed to get fingerprint: " + errorString(state);
	} finally {
		if (tmpFile)
			useSpawn(['rm', tmpFile], { superuser: 'try' });
	}
	return result;
}

/**
 * @typedef {Object} SSHAuthorizedKeyObj
 * @memberof module:cockpit-syntaxes
 * @alias SSHAuthorizedKeyObj
 * @property {String[]|null} options - Options for authorized key, null if not present
 * @property {String} algo - Key algorithm
 * @property {String} pubKey - The public key
 * @property {String} comment - Comment/name for key
 * @property {String} fingerprint - Key's fingerprint
 */

/**
 * @namespace {Object} SSHAuthorizedKeysSyntax
 * @memberof module:cockpit-syntaxes
 * @alias SSHAuthorizedKeysSyntax
 * @description
 * Syntax object for parsing/stringifying ~/.ssh/authorized_keys
 */
const SSHAuthorizedKeysSyntax = {
	/**
	 * Parse text content of ~/.ssh/authorized_keys into array of objects
	 * @memberof SSHAuthorizedKeysSyntax
	 * @method
	 * @param {String} confText 
	 * @returns {Promise<SSHAuthorizedKeyObj[]>}
	 */
	parse: async (string) => {
		return (await Promise.all(string.split('\n')
			.filter(line => !/^(\s*|\s*#.*)$/.test(line)) // remove empty lines and comments
			.map(line => line.replace(/\s*#.*$/, '')) // remove end-of-line comments
			.map(async (line) => {
				const obj = {
					pubKey: line,
					fingerprint: await getFingerprint(line),
				};
				const regexp = new RegExp([
					/^((?:\w+=(?:"[^"]*"|'[^']*'|(?:[^,\s]|\\\s)*),?)+)?/, // first group: possible options at start of line
					/\s*/,                                                // space delimiter
					/\b(\S+)\b/,                                          // second group: algorithm
					/\s*/,                                                // space delimiter
					/(\S+)/,                                              // third group: key
					/\s*/,                                                // space delimiter
					/(\S*)$/,                                             // fourth group: comment
				].map(r => r.source).join(''));
				const regMatch = line.match(regexp);
				if (!regMatch) {
					console.error("regex match on key failed: " + line);
					return null;
				}
				// split on unquoted unescaped commas
				obj.options = regMatch[1]?.split(/(?<!\\),(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)(?=(?:[^\']*\'[^\']*\')*[^\']*$)/g) ?? null;
				obj.algo = regMatch[2];
				obj.pubKey = regMatch[3];
				obj.comment = regMatch[4];
				return obj;
			})))
			.filter(obj => obj !== null);
	},
	/**
	 * Convert array of keys to text for ~/.ssh/authorized_keys
	 * @memberof SSHAuthorizedKeysSyntax
	 * @method
	 * @param {SSHAuthorizedKeyObj[]} objs
	 * @returns {String}
	 */
	stringify: (objs) => {
		return (
			objs.map(obj => [
					obj.options?.join(',') ?? null,
					obj.algo,
					obj.pubKey,
					obj.comment,
				]
				.filter(field => field !== null)
				.join(' '))
			.join('\n') ?? ""
		) + '\n';
	}
};

export {
	SSHAuthorizedKeysSyntax,
}