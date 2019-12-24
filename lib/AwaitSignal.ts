// Type safe signal class for async functions

export interface IAwaitSignalConnection {
    disconnect: () => void;
}

export class AwaitSignal<Args extends any[]> {
    private connections: Array<(...args: Args) => Promise<void>>;

    constructor() {
        this.connections = [];
    }

    public fire: (...args: Args) => Promise<void> = async (...args) => {
        for (const callback of this.connections) {
            await callback(...args);
        }
    };

    public connect(callback: (...args: Args) => Promise<void>): IAwaitSignalConnection {
        const connections = this.connections;
        connections.push(callback);
        return {
            disconnect: () => {
                const index = connections.indexOf(callback);
                if (index !== -1) {
                    connections.splice(index, 1);
                }
            }
        };
    }
}
