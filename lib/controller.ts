import { Config } from "./config";
import { Queue, IQueueEntry } from "./queue";
import { identifySpotifyResource } from "./identifySpotifyResource";

export interface IActionResult {
    success: boolean;
    message?: string;
}

export class Controller {
    private config: Config;
    private queue: Queue;

    constructor(config: Config, queue: Queue) {
        this.config = config;
        this.queue = queue;
    }

    public async add(creatorId: string, resourceString: string, limit?: number): Promise<IActionResult> {
        const resource = identifySpotifyResource(resourceString);
        if (!resource) {
            return {
                success: false,
                message: "Invalid resource"
            };
        }
        try {
            const addResponse = await this.queue.add(resource, creatorId, limit);
            let message: string;
            if (addResponse.tracks === 0) {
                return {
                    success: false,
                    message: "No playable track found"
                };
            }
            if (addResponse.type === "track") {
                message = `<${creatorId}> added ${addResponse.name} to the queue`;
            } else {
                message = `<${creatorId}> added ${addResponse.tracks} tracks from ${addResponse.type} ${addResponse.name} to the queue`;
            }
            return {
                success: true,
                message
            };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: "Error adding resource"
            };
        }
    }

    public async play(): Promise<IActionResult> {
        if (this.queue.isPlaying()) {
            return {
                success: false,
                message: "Queue already playing"
            };
        }
        try {
            let queueEntry: IQueueEntry;
            if (!this.queue.getCurrentEntry()) {
                if (this.queue.getQueue().length === 0) {
                    return {
                        success: false,
                        message: "Queue empty"
                    };
                }
                queueEntry = await this.queue.nextTrack();
            } else {
                queueEntry = await this.queue.resume();
            }
            return {
                success: true,
                message: `Now playing ${queueEntry.name}`
            };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: "Error playing track"
            };
        }
    }

    public async pause(): Promise<IActionResult> {
        if (!this.queue.isPlaying()) {
            try {
                await this.queue.stop();
                return {
                    success: true,
                    message: "Queue not playing, stopped Spotify anyway"
                };
            } catch (error) {
                console.error(error);
                return {
                    success: false,
                    message: "Error when stopping Spotify"
                };
            }
        }
        try {
            await this.queue.pause();
            return { success: true };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: "Error when pausing Spotify"
            };
        }
    }

    public async changeVolume(up: boolean): Promise<IActionResult> {
        const spotify = this.queue.spotify;
        const volume = spotify.volume;
        const volumeDelta = this.config.get().VOLUME_DELTA;
        const delta = up ? volumeDelta : -volumeDelta;
        const newVolume = Math.floor(Math.min(100, Math.max(0, volume + delta)));
        if (newVolume === volume) {
            return {
                success: false,
                message: `Already at ${up ? "max" : "min"} volume`
            };
        }
        try {
            await spotify.setVolume(newVolume);
            return {
                success: true,
                message: `Set volume to ${newVolume}%`
            };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: "Error when setting volume"
            };
        }
    }
}
