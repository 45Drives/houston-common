import { Group } from '@/group';
import { Directory, File } from '@/path';
import { Server } from '@/server';

export class User {
    constructor(
        public login: string,
        public uid: number,
        public _primaryGroupID: number,
        public name: string,
        public home: Directory,
        public shell: File,
        public server: Server
    ) { }

    // getPrimaryGroup(): Group {
    //      // TODO
    // }

    getGroups(): Group[] {
        return []; // TODO
    }
};
