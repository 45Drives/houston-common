/**
 * @description
 * Various functions and classes to aid in creating plugins for Cockpit
 *
 * ## Processes
 *   - {@link process} - Process spawning API (succeeds/replaces useSpawn)
 *   - {@link useSpawn useSpawn()} - Running a process on the server
 *   - {@link processOutputDownload processOutputDownload()} - Running a process on the server and downloading output
 *   - {@link localCurl localCurl()} - Query a HTTP endpoint with `curl` and get the response text
 * ## Downloading Content
 *   - {@link downloadURL downloadURL()} - 'Click' a link with the ```<a>``` hack
 *   - {@link processOutputDownload processOutputDownload()} - Running a process on the server and downloading output
 *   - {@link fileDownload fileDownload()} - Downloading a file from the server by path
 *   - {@link objectURLDownload objectURLDownload()} - Download any content (string, Blob, etc) as a file
 * ## Utility
 *   - {@link canonicalPath canonicalPath()} - Canonicalize/normalize path
 *   - {@link systemdUnitEscape systemdUnitEscape()} - String to valid Systemd unit name
 *   - {@link systemdUnitUnescape systemdUnitUnescape()} - Valid Systemd unit name back to original string
 * 
 */

/// <reference path="../typings/cockpit-typings/cockpit.d.ts" />
/// <reference path="../typings/cockpit-typings/cockpit-extra.d.ts" />
/// <reference path="../typings/cockpit-typings/cockpit-import-hack.d.ts" />

export * from '@/houston';
export * from '@/syntax';
export * from '@/utils';
export * from '@/errors';
