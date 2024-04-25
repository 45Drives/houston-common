import { Server } from '@/server';
import { User } from '@/user';

export class Group {
    constructor(
        public name: string,
        public gid: number,
        public _memberLogins: string[],
        public server: Server
    ) {}

    getMembers(): User[] {
        
    }

    getPrimaryMember(): User | null {

    }
};
