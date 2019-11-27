import { Spotify, ITrackEntry, IGroupEntry } from "./spotify";
import { Config } from "./config";
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
    creatorId: string;
    groupId: number;
    tracks: number;
}

export class Queue {
    private spotify: Spotify;
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

    private addGroupToQueue(groupEntry: IGroupEntry, creatorId: string, groupId: number, trackLimit?: number): void {
        const defaultTrackLimit = this.config.get().DEFAULT_TRACK_LIMIT;
        const limit = trackLimit ? trackLimit : defaultTrackLimit;
        for (let i = 0; i < Math.min(limit, groupEntry.tracks.length); i++) {
            const trackEntry = groupEntry.tracks[i];
            this.addTrackToQueue(trackEntry, creatorId, groupId);
        }
    }

    public async add(resource: IResource, creatorId: string, trackLimit?: number): Promise<IAddResponse> {
        this.groupId += 1;
        const groupId = this.groupId;
        if (resource.type === "track") {
            const trackEntry = await this.spotify.getTrack(resource.id);
            this.addTrackToQueue(trackEntry, creatorId, groupId);
            return {
                name: trackEntry.name,
                creatorId,
                groupId,
                tracks: 1
            };
        } else if (resource.type === "album") {
            const groupEntry = await this.spotify.getAlbum(resource.id);
            this.addGroupToQueue(groupEntry, creatorId, groupId, trackLimit);
            return {
                name: groupEntry.name,
                creatorId,
                groupId,
                tracks: trackLimit ? Math.min(groupEntry.tracks.length, trackLimit) : groupEntry.tracks.length
            };
        } else if (resource.type === "playlist") {
            const groupEntry = await this.spotify.getPlaylist(resource.id);
            this.addGroupToQueue(groupEntry, creatorId, groupId, trackLimit);
            return {
                name: groupEntry.name,
                creatorId,
                groupId,
                tracks: trackLimit ? Math.min(groupEntry.tracks.length, trackLimit) : groupEntry.tracks.length
            };
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
