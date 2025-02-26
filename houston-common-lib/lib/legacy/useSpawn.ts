import type Cockpit from "cockpit";

export interface SpawnState<T extends string | Uint8Array> {
  /**
   * Whether or not the process is still running
   */
  loading: boolean;
  /**
   * Exit code of the process
   */
  status?: number | null;
  /**
   * Output of process printed to stdout
   */
  stdout?: T;
  /**
   * Output of process printed to stderr
   */
  stderr?: string;
  /**
   * Copy of argv passed to {@link useSpawn}
   */
  argv: string[];
  /**
   * Process handle returned from [cockpit.spawn()](https://cockpit-project.org/guide/latest/cockpit-spawn)
   */
  proc: Cockpit.Spawn<T>;
  /**
   * The promise that resolves when proc finishes
   */
  _promise: Promise<SpawnState<T>>;
  /**
   * Get promise that resolves with self when the process finishes
   */
  promise(): Promise<SpawnState<T>>;
  /**
   * Get string form of argv with conditionally quoted tokens
   */
  argvPretty(): string;
  /**
   * Get HTML formatted error message with exit code and argv if specified
   * @param fullArgv - Print full argv with message
   */
  errorStringHTML(fullArgv: boolean): string;
}

/**
 * Wrapper for using {@link @45drives/cockpit-typings!spawn cockpit.spawn()}
 *
 * Executes process in argv on the server (or on opts.host if defined), and returns output in {@link SpawnState.stdout}
 *
 * @example
 * import { useSpawn, errorString } from '@45drives/cockpit-helpers';
 *
 * async function getHostnameAsync() {
 * 	try {
 * 		const state = useSpawn(['hostname'], { superuser: 'try' });
 * 		const hostname = (await state.promise()).stdout;
 * 		return hostname;
 * 	} catch (state) {
 * 		console.error(errorString(state));
 * 		return null;
 * 	}
 * }
 *
 * function getHostnamePromise() {
 * 	return new Promise((resolve, reject) => {
 * 		const state = useSpawn(['hostname'], { superuser: 'try' });
 * 		state.promise()
 * 			.then(({stdout}) => resolve(stdout))
 * 			.catch(state => {
 * 				console.error(errorString(state))
 * 				reject(null);
 * 			});
 * 	});
 * }
 *
 * @param argv - Argument vector to execute
 * @param opts - {@link @45drives/cockpit-typings!spawn cockpit.spawn()} options
 * @param stderr - where to pipe stderr of proc
 * @returns the process state object
 * @deprecated use {@link Server.Execute()}
 */
export function useSpawn(
  argv: string[],
  opts?: Cockpit.SpawnOptions & { binary?: false },
  stderr?: "out" | "message"
): SpawnState<string>;
export function useSpawn(
  argv: string[],
  opts?: Cockpit.SpawnOptions & { binary: true },
  stderr?: "out" | "message"
): SpawnState<Uint8Array>;
export function useSpawn(
  argv: string[] = [],
  opts:
    | (Cockpit.SpawnOptions & { binary: true })
    | (Cockpit.SpawnOptions & { binary?: false }) = {},
  stderr: "out" | "message" = "message"
): SpawnState<string> | SpawnState<Uint8Array> {
  opts.superuser ??= "require";
  opts.err ??= stderr;

/*
const state = {
    loading: true,
    argv: [...argv],
    proc: cockpit.spawn(argv, opts as any),
    stdout: undefined as (typeof opts extends { binary: true } ? Uint8Array : string) | undefined,
    stderr: undefined as (typeof opts extends { binary: true } ? Uint8Array : string) | undefined,
    status: undefined as number | undefined,
    _promise: new Promise((resolve, reject) => {
      state.proc
        .then((_stdout, _stderr) => {
          state.stdout = _stdout;
          state.stderr = _stderr;
          resolve(state);
        })
        .catch((ex, _stdout) => {
          state.stdout = _stdout;
          state.stderr = ex.message ?? ex.problem;
          state.status = ex.exit_status ?? undefined;
          reject(state);
        })
        .finally(() => {
          state.loading = false;
        });
    }),
    promise: () => state._promise,
    argvPretty: () => {
      return argv.map((token) => (/\s/.test(token) ? `"${token}"` : token)).join(" ");
    }, 
*/

  // Initialize state as undefined to delay its definition

  let state: SpawnState<string | Uint8Array>;
  const proc = cockpit.spawn(argv, opts as any);

  const _promise = new Promise<SpawnState<string | Uint8Array>>((resolve, reject) => {

    proc
      .then((_stdout, _stderr) => {
        state.stdout = _stdout;
        state.stderr = _stderr;
        resolve(state);
      })
      .catch((ex, _stdout) => {
        state.stdout = _stdout;
        state.stderr = ex.message ?? ex.problem;
        state.status = ex.exit_status ?? undefined;
        reject(state);
      })
      .finally(() => {
        state.loading = false;
      });
  });

  state = {
    loading: true,
    argv: [...argv],
    proc: cockpit.spawn(argv, opts as any),
    stdout: undefined,
    stderr: undefined,
    status: undefined,
    _promise,

    promise: () => _promise,
    argvPretty: () =>
      argv.map((token) => (/\s/.test(token) ? `"${token}"` : token)).join(" "),
    errorStringHTML(fullArgv = false) {
      return (
        '<span class="font-mono text-sm whitespace-pre-wrap">' +
        `<span class="font-semibold">${this.argv[0]}: </span>` +
        `<span>${errorString(this)} (${this.status})</span>` +
        "</span>" +
        (fullArgv
          ? `<span class="text-gray-500 font-mono text-sm whitespace-pre-wrap">${this.argvPretty()}</span>`
          : "")
      );
    },
  };

  
  // Assign the proc and _promise to the state
  state.proc = proc;
  state._promise = _promise;
  // state = {
  //   loading: true,
  //   argv: [...argv],
  //   proc: cockpit.spawn(argv, opts as any),
  //   stdout: undefined,
  //   stderr: undefined,
  //   status: undefined,
  //   _promise,
  //   promise: () => _promise,
  //   argvPretty: () =>
  //     argv.map((token) => (/\s/.test(token) ? `"${token}"` : token)).join(" "),
  //   errorStringHTML(fullArgv = false) {
  //     return (
  //       '<span class="font-mono text-sm whitespace-pre-wrap">' +
  //       `<span class="font-semibold">${this.argv[0]}: </span>` +
  //       `<span>${errorString(this)} (${this.status})</span>` +
  //       "</span>" +
  //       (fullArgv
  //         ? `<span class="text-gray-500 font-mono text-sm whitespace-pre-wrap">${this.argvPretty()}</span>`
  //         : "")
  //     );
  //   },
  // };
  if (opts.binary) return state as any as SpawnState<Uint8Array>;
  else return state as any as SpawnState<string>;
}

/** To be used in the catch of a try...catch where useSpawn is called.
 * Allows for easily getting a string out of either a SpawnState, an Error,
 * or just a String.
 * @param state
 * @returns Error message
 */
export function errorString(
  state: SpawnState<string | Uint8Array> | { message: string } | string | any
): string {
  if (typeof state === "string") return state;
  return state?.stderr ?? state?.message ?? JSON.stringify(state);
}

/** To be used in the catch of a try...catch where useSpawn is called.
 * Allows for easily getting a string out of either a SpawnState, an Error,
 * or just a String.
 * @param state 
 * @returns Error message Formatted as HTML for use in Notifications body
 */
export function errorStringHTML(state: SpawnState<any> | { message: string; } | string | any): string {
  if (typeof state === "string")
    return `<span class="text-gray-500 font-mono text-sm whitespace-pre-wrap">${state}</span>`;
  return (state.errorStringHTML?.() ?? (`<span class="text-gray-500 font-mono text-sm whitespace-pre-wrap">${state?.stderr ?? state?.message ?? JSON.stringify(state)}</span>`));

}
