// A safe interface for playback actions

import { Config } from "./Config";
import { Queue, IQueueEntry } from "./Queue";
import { identifySpotifyResource } from "./identifySpotifyResource";
import { IActionResult } from "./CommandTypes";

function getPlayerErrorMessage(prefix: string, error: any) {
    if (typeof error === "object" && error.message) {
        return `${prefix}: \`${error.message}\``;
    }
    return prefix;
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

    public async play(userId: string): Promise<IActionResult> {
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
                message: `<${userId}> hit play, now playing ${queueEntry.name}`
            };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: getPlayerErrorMessage("Error playing track", error)
            };
        }
    }

    public async pause(userId: string): Promise<IActionResult> {
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
                    message: getPlayerErrorMessage("Error stopping spotify", error)
                };
            }
        }
        try {
            await this.queue.pause();
            return { success: true, message: `<${userId}> hit pause` };
        } catch (error) {
            return {
                success: false,
                message: getPlayerErrorMessage("Error pausing spotify", error)
            };
        }
    }

    public async changeVolume(userId: string, up: boolean, customValue?: number): Promise<IActionResult> {
        const configValues = this.config.get();
        const value = customValue
            ? Math.min(customValue, configValues.MAX_VOLUME_DELTA)
            : configValues.DEFAULT_VOLUME_DELTA;
        const spotify = this.queue.spotify;
        const volume = spotify.volume;
        const delta = up ? value : -value;
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
                message: `<${userId}> set volume to ${newVolume}%`
            };
        } catch (error) {
            console.error(error);
            return {
                success: false,
                message: getPlayerErrorMessage("Error changing volume", error)
            };
        }
    }
}
