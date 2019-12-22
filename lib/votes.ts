// Handles votes and skipping
import cloneDeep from "lodash.clonedeep";

import { Config } from "./Config";
import { Queue, IQueueEntry } from "./Queue";
import { IActionResult } from "./CommandTypes";

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

    private getAllTracks() {
        let allTracks: IQueueEntry[] = [];
        const currentEntry = this.queue.getCurrentEntry();
        if (currentEntry) {
            allTracks.push(currentEntry);
        }
        allTracks = allTracks.concat(this.queue.getQueue());
        return allTracks;
    }

    private getEntry(queueId: number) {
        const allTracks = this.getAllTracks();
        return allTracks.find((entry) => entry.queueId === queueId);
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
                const entry = this.getEntry(queueId);
                const isCreator = entry ? entry.creatorId === userId : false;
                if (vote.usersFor.length >= this.threshold || isCreator) {
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
        const allTracks = this.getAllTracks();
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

    public async skipCurrent(userId: string, group: boolean): Promise<IActionResult> {
        const currentEntry = this.queue.getCurrentEntry();
        if (!currentEntry) {
            return { success: false, message: "No active track" };
        }
        const canVote = group
            ? this.canVoteOnTrack(userId, currentEntry.queueId)
            : this.canVoteOnGroup(userId, currentEntry.groupId);

        if (!canVote) {
            const type = group ? "group" : "track";
            return { success: false, message: `Already voted to skip this ${type}` };
        }

        const voteResults = group
            ? await this.voteOnGroup(userId, currentEntry.groupId)
            : await this.voteOnTracks(userId, [currentEntry.queueId]);

        const votesPassed = voteResults.filter((vote) => vote.passed).length;

        if (votesPassed === 0) {
            if (group) {
                return {
                    success: true,
                    message: `<@${userId}> voted to skip ${voteResults.length} track(s) from ${currentEntry.groupName}`
                };
            } else {
                return {
                    success: true,
                    message: `<@${userId}> voted to skip ${currentEntry.name}`
                };
            }
        } else {
            if (group) {
                return {
                    success: true,
                    message: `<@${userId}> voted to skip ${voteResults.length} track(s) from ${currentEntry.groupName}. Now skipping ${votesPassed} track(s)`
                };
            } else {
                return {
                    success: true,
                    message: `<@${userId}> voted to skip ${currentEntry.name}. Now skipping`
                };
            }
        }
    }
}
