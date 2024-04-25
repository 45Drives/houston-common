export * from 'cockpit';

declare module 'cockpit' {

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
    };

    export const transport: Transport;

    interface SpawnOptions {
        host?: string;
    };

    interface SpawnException extends BasicError {
        exit_status: number | null;
        exit_signal: string | null;
    };

    interface Spawn<T> {
        then(callback: (data: T, message: string) => void | PromiseLike<void>): Spawn<T>;
        catch(callback: (ex: SpawnException, data: T) => void | PromiseLike<void>): Spawn<T>;
        close(problem?: string): void;
    };

}
