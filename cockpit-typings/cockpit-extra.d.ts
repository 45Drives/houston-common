declare module "cockpit" {
  interface Transport {
    origin: string | null;
    host: string | null;
    csrf_token: string | null;
    options: {
      capabilities: string[];
      "channel-seed": string;
      command: string;
      "csrf-token": string;
      host: string;
      system: {
        version: string;
      };
      version: number;
    };
  }

  export const transport: Transport;

  interface SpawnOptions {
    host?: string;
  }

  interface SpawnException extends BasicError {
    exit_status: number | null;
    exit_signal: string | null;
  }

  interface Spawn<T> {
    then(
      callback: (data: T, message: string) => void | PromiseLike<void>
    ): Spawn<T>;
    catch(
      callback: (ex: SpawnException, data: T) => void | PromiseLike<void>
    ): Spawn<T>;
    close(problem?: string): void;
  }

  /**
   * Storage Helper
   *
   * Use application to prefix data stored in browser storage
   * with helpers for compatibility.
   */
  export interface StorageHelper {
    /**
     * Prefix key with application name, i.e. cockpit.transport.application() + ':' + key;
     * @param key - storage lookup key
     */
    prefixedKey(key: string): string;
    /**
     * Get value from window storage with prefixed key
     * @param key - storage lookup key
     * @param both - get with unprefixed key if not found
     */
    getItem(key: string, both?: boolean): string | null;
    /**
     * Set value from window storage with prefixed key
     * @param key - storage lookup key
     * @param value - value to set
     * @param both - set with both prefixed and unprefixed key
     */
    setItem(key: string, value: string, both?: boolean): void;
    /**
     * Remove a value from window storage with prefixed key
     * @param key - storage lookup key
     * @param both - remove with both prefixed and unprefixed key
     */
    removeItem(key: string, both?: boolean): void;
    /**
     * Remove all items from window storage starting with application prefix
     * @param full - remove unprefixed keys as well
     */
    clear(full: boolean): void;
  }

  export const localStorage: StorageHelper;
  export const sessionStorage: StorageHelper;

  export let onvisibilitychange: function | undefined;
}
