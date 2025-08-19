export const getentBashScriptJsonOuptut = (db: "passwd" | "group", domain: boolean) => {
	const [nameKey, idKey, wbinfoFlag] = {
		'passwd': ['login', 'uid', '-u'],
		'group': ['name', 'gid', '-g']
	}[db];
	const getent = domain ? `wbinfo ${wbinfoFlag} | xargs -d'\\n' -r getent -s winbind` : `getent -s files`;
	return `set -o pipefail; ${getent} ${db} | awk -F: '
		BEGIN { printf "[" }
		{
			printf sep;
			printf "{";
			printf "\\"${nameKey}\\":\\"%s\\",",$1;
			printf "\\"${idKey}\\":%d,",$3;
			printf "\\"domain\\":${domain.toString()}";
			printf "}";
			sep = ",";
		}
		END { printf "]" }
		'`;
};
