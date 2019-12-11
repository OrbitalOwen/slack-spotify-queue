// Handles the queuing and playback of tracks

import { Spotify, ITrackEntry, IGroupEntry } from "./Spotify";
import { Config } from "./Config";
import { IResource } from "./identifySpotifyResource";
import cloneDeep from "lodash.clonedeep";

export interface IQueueEntry extends ITrackEntry {
    creatorId: string;
    queueId: number;
    groupId: number;
    pausedProgressMs?: number;
}

export interface IAddResponse {
    name: string;
    type: string;
    creatorId: string;
    groupId: number;
    tracks: number;
}

export class Queue {
    public spotify: Spotify;
    private config: Config;
    private queue: IQueueEntry[];
    private queueId: number;
    private groupId: number;
    private currentEntry?: IQueueEntry;
    private playing: boolean;

    constructor(config: Config, spotify: Spotify) {
        this.config = config;
        this.spotify = spotify;
        this.queue = [];
        this.queueId = 0;
        this.groupId = 0;
        this.playing = false;
    }

    private addTrackToQueue(trackEntry: ITrackEntry, creatorId: string, groupId: number): void {
        this.queueId += 1;
        const queueId = this.queueId;
        const queueEntry: IQueueEntry = Object.assign({}, trackEntry, {
            creatorId,
            queueId,
            groupId
        });
        this.queue.push(queueEntry);
    }

    private addGroupToQueue(groupEntry: IGroupEntry, creatorId: string, groupId: number, trackLimit?: number): number {
        const defaultTrackLimit = this.config.get().DEFAULT_TRACK_LIMIT;
        const limit = trackLimit ? trackLimit : defaultTrackLimit;

        const validTracks = groupEntry.tracks.filter((track) => {
            return track.isPlayable;
        });

        let tracksAdded = 0;
        for (let i = 0; i < Math.min(limit, validTracks.length); i++) {
            const trackEntry = validTracks[i];
            if (trackEntry.isPlayable) {
                tracksAdded += 1;
                this.addTrackToQueue(trackEntry, creatorId, groupId);
            }
        }

        return tracksAdded;
    }

    public async add(resource: IResource, creatorId: string, trackLimit?: number): Promise<IAddResponse> {
        this.groupId += 1;
        const groupId = this.groupId;
        if (resource.type === "track") {
            const trackEntry = await this.spotify.getTrack(resource.id);
            if (trackEntry.isPlayable) {
                this.addTrackToQueue(trackEntry, creatorId, groupId);
            }
            return {
                name: trackEntry.name,
                type: resource.type,
                creatorId,
                groupId,
                tracks: trackEntry.isPlayable ? 1 : 0
            };
        } else {
            let groupEntry: IGroupEntry;
            if (resource.type === "album") {
                groupEntry = await this.spotify.getAlbum(resource.id);
            } else if (resource.type === "playlist") {
                groupEntry = await this.spotify.getPlaylist(resource.id);
            }
            if (groupEntry) {
                const tracksAdded = this.addGroupToQueue(groupEntry, creatorId, groupId, trackLimit);
                return {
                    name: groupEntry.name,
                    type: resource.type,
                    creatorId,
                    groupId,
                    tracks: tracksAdded
                };
            }
        }
    }

    private async advanceTrackIfOver(queueEntry: IQueueEntry): Promise<void> {
        const playbackInfo = await this.spotify.getPlaybackInfo();
        if (!this.playing) {
            return;
        }
        if (this.queueId !== queueEntry.queueId) {
            return;
        }
        if (playbackInfo.trackUri !== queueEntry.uri) {
            return;
        }
        const timeLeft = playbackInfo.progressMs ? queueEntry.durationMs - playbackInfo.progressMs : 0;
        if (timeLeft <= 0) {
            await this.nextTrack().catch(console.error);
        } else {
            const queue = this;
            setTimeout(async () => {
                await queue.advanceTrackIfOver(queueEntry).catch(console.error);
            }, Math.max(1000, timeLeft));
        }
    }

    public async nextTrack(): Promise<IQueueEntry | undefined> {
        const queueEntry = this.queue[0];
        if (!queueEntry) {
            await this.spotify.pause();
            this.currentEntry = null;
            this.playing = false;
            return;
        }
        await this.spotify.play(queueEntry.uri);
        this.currentEntry = queueEntry;
        this.queue = this.queue.slice(1, this.queue.length);
        this.playing = true;
        const queue = this;
        setTimeout(async () => {
            await queue.advanceTrackIfOver(queueEntry).catch(console.error);
        }, queueEntry.durationMs);
        return queueEntry;
    }

    public async removeTracks(queueIds: number[]) {
        this.queue = this.queue.filter((entry) => !queueIds.includes(entry.queueId));
        if (this.currentEntry && queueIds.includes(this.currentEntry.queueId)) {
            await this.nextTrack();
        }
    }

    public async pause(): Promise<void> {
        if (!this.playing) {
            throw new Error("Cannot pause. Not playing.");
        }
        const playbackInfo = await this.spotify.getPlaybackInfo();
        if (!playbackInfo.isPlaying) {
            throw new Error("Spotify isn't playing. Unable to pause.");
        }
        if (playbackInfo.trackUri !== this.currentEntry.uri) {
            throw new Error("Spotify is playing an incorrect track. Unable to pause.");
        }
        if (!playbackInfo.progressMs) {
            throw new Error("Spotify did not return progress info. Unable to pause");
        }
        await this.spotify.pause();
        if (this.currentEntry.durationMs - playbackInfo.progressMs > 0) {
            this.currentEntry.pausedProgressMs = playbackInfo.progressMs;
        }
        this.playing = false;
    }

    public async stop(): Promise<void> {
        await this.spotify.pause();
    }

    public async resume(): Promise<IQueueEntry> {
        if (this.playing) {
            throw new Error("Cannot resume. Already playing.");
        }
        if (!this.currentEntry) {
            throw new Error("Cannot resume. No current track.");
        }
        await this.spotify.play(this.currentEntry.uri, this.currentEntry.pausedProgressMs);
        this.playing = true;
        return this.currentEntry;
    }

    public clear(): void {
        this.queue = [];
    }

    public getQueue(): IQueueEntry[] {
        return cloneDeep(this.queue);
    }

    public getCurrentEntry(): IQueueEntry | undefined {
        if (this.currentEntry) {
            return Object.assign({}, this.currentEntry);
        }
    }

    public isPlaying(): boolean {
        return this.playing;
    }
}
