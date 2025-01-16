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

import { useSpawn, errorString } from ".";
import Cockpit from "cockpit";

export class BetterCockpitFile {
  failIfDNE: boolean;
  persistStat: boolean;
  fileHandle: Cockpit.FileHandle<string>;
  hookedFileHandle: Cockpit.FileHandle<string>;
  path: string;
  stat?: { uid?: string; gid?: string; permissions?: string };

  /**
   * Improved wrapper of [cockpit.file()](https://cockpit-project.org/guide/latest/cockpit-file.html)
   * @param {string} path - path to file
   * @param {import('@45drives/cockpit-typings').File.Options<string | Uint8Array, any> & {dne?: string; persistStat?: boolean}} opts - options, same as [cockpit.file()](https://cockpit-project.org/guide/latest/cockpit-file.html) plus:
   * @param {string} opts.dne - if 'fail', throws error from read if file does not exist
   * @param {boolean} opts.persistStat - keep ownership and permissions through writes
   */
  constructor(
    path: string,
    opts: Cockpit.FileOpenOptions & { dne?: "fail"; persistStat?: boolean }
  ) {
    const opts_ = { ...opts };
    this.failIfDNE = opts_.dne === "fail";
    delete opts_.dne;
    this.persistStat = opts_.persistStat ?? false;
    delete opts_.persistStat;
    /**
     * @private
     * @hidden
     */
    this.fileHandle = cockpit.file(path, opts_);
    /**
     * @private
     * @hidden
     */
    this.hookedFileHandle = {
      ...this.fileHandle,
      read: this.read,
      replace: this.replace,
      close: this.close,
    };
    this.path = path;
  }

  /**
   * Read contents of file, reject if doesn't exist && opts.dne
   * @returns {Promise<string>}
   */
  read(): Promise<string> {
    if (this.failIfDNE)
      return new Promise((resolve, reject) => {
        this.fileHandle
          .read()
          .then(((content: string, tag?: string) => {
            if (content === null && tag === "-")
              reject(new Error("File does not exist: " + this.path));
            else resolve(...([content, tag] as unknown as [string]));
          }) as (content: string) => void)
          .catch((error) => reject(error));
      });
    else return this.fileHandle.read();
  }

  /**
   * Replace contents of file, maintaining file permissions
   * @param {string} content - New content of file
   * @param {string} expected_tag - See [cockpit.file()](https://cockpit-project.org/guide/latest/cockpit-file.html)
   * @returns {Promise<string>} Resolves with file tag
   */
  replace(content: string): Promise<string> {
    if (this.persistStat)
      return new Promise(async (resolve, reject) => {
        await this.getStat();
        this.fileHandle
          .replace(content)
          .then((content) =>
            this.setStat()
              .then(() => resolve(content))
              .catch((error) => reject(error))
          )
          .catch((error) => reject(error));
      });
    else return this.fileHandle.replace(content);
  }

  watch(callback: Cockpit.FileWatchCallback<string>, opts: { read?: boolean }) {
    return this.hookedFileHandle.watch(callback, opts);
  }

  close() {
    return this.fileHandle.close();
  }

  async getStat() {
    try {
      const statFields = (await useSpawn(["stat", this.path, "--format=%u:%g:%a"]).promise())
        .stdout!.split(":")
        .map((a) => a.trim());
      this.stat = { uid: statFields[0]!, gid: statFields[1]!, permissions: statFields[2]! };
      return { ...this.stat };
    } catch (state) {
      throw new Error(errorString(state));
    }
  }

  async setStat(stat = {}) {
    const tmpStat = { ...this.stat, ...stat };
    let ownership = "";
    if (tmpStat.uid) ownership += tmpStat.uid;
    if (tmpStat.gid) ownership += ":" + tmpStat.gid;
    if (ownership) {
      try {
        await useSpawn(["chown", ownership, this.path]).promise();
      } catch (state) {
        throw new Error(errorString(state));
      }
    }
    if (tmpStat.permissions) {
      try {
        await useSpawn(["chmod", tmpStat.permissions, this.path]).promise();
      } catch (state) {
        throw new Error(errorString(state));
      }
    }
    this.stat = tmpStat;
  }
}
