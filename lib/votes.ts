// Handles votes and skipping

import { Config } from "./Config";
import { Queue, IQueueEntry } from "./Queue";
import cloneDeep from "lodash.clonedeep";

interface IVote {
    queueId: number;
    usersFor: string[];
    passed?: boolean;
}

export class Votes {
    private queue: Queue;
    private threshold: number;
    private votes: IVote[];

    constructor(config: Config, queue: Queue) {
        this.threshold = config.get().SKIP_THRESHOLD;
        this.queue = queue;
        this.votes = [];
    }

    public canVoteOnTrack(userId: string, queueId: number): boolean {
        const vote = this.votes.find((trackVote) => trackVote.queueId === queueId);
        if (!vote) {
            return true;
        }
        return !vote.usersFor.includes(userId);
    }

    public async voteOnTracks(userId: string, queueIds: number[]): Promise<IVote[]> {
        const idsToRemove: number[] = [];
        const votesParticipated: IVote[] = [];
        for (const queueId of queueIds) {
            let vote = this.votes.find((trackVote) => trackVote.queueId === queueId);
            if (!vote) {
                vote = {
                    queueId,
                    usersFor: []
                };
                this.votes.push(vote);
            }
            if (!vote.usersFor.includes(userId)) {
                vote.usersFor.push(userId);
                if (vote.usersFor.length >= this.threshold) {
                    vote.passed = true;
                    idsToRemove.push(vote.queueId);
                    const index = this.votes.indexOf(vote);
                    this.votes.splice(index, 1);
                }
                votesParticipated.push(cloneDeep(vote));
            }
        }
        if (idsToRemove.length !== 0) {
            await this.queue.removeTracks(idsToRemove);
        }
        return votesParticipated;
    }

    private getTracksInGroup(groupId: number): number[] {
        let allTracks: IQueueEntry[] = [];
        const currentEntry = this.queue.getCurrentEntry();
        if (currentEntry) {
            allTracks.push(currentEntry);
        }
        allTracks = allTracks.concat(this.queue.getQueue());
        return allTracks.filter((entry) => entry.groupId === groupId).map((entry) => entry.queueId);
    }

    public canVoteOnGroup(userId: string, groupId: number): boolean {
        const queueIds = this.getTracksInGroup(groupId);
        for (const queueId of queueIds) {
            if (this.canVoteOnTrack(userId, queueId)) {
                return true;
            }
        }
        return false;
    }

    public async voteOnGroup(userId: string, groupId: number): Promise<IVote[]> {
        const queueIds = this.getTracksInGroup(groupId);
        return await this.voteOnTracks(userId, queueIds);
    }
}
