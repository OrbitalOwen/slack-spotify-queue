import SpotifyQueue from "./spotifyQueue";

export default class SkipVoter {
    private spotifyQueue: SpotifyQueue;
    private trackVoteNumber: number;
    private groupVoteNumber: number;
    private trackVotes: string[];
    private groupVotes: string[];
    private skipThreshold: number;

    constructor(spotifyQueue, skipThreshold) {
        this.spotifyQueue = spotifyQueue;
        this.skipThreshold = skipThreshold;
        this.trackVoteNumber = 0;

        this.trackVotes = [];
        this.groupVotes = [];
    }

    public canSkipTrack(slackUserId: string): boolean {
        const currentTrackNumber = this.spotifyQueue.getCurrentTrackNumber();
        const currentTrackName = this.spotifyQueue.getCurrentTrackName();
        if (!currentTrackName) {
            return false;
        }
        if (currentTrackNumber !== this.trackVoteNumber) {
            this.resetTrackVotes(currentTrackNumber)
        }
        return !this.trackVotes.includes(slackUserId);
    }

    public registerTrackVote(slackUserId: string): boolean {
        const currentPlayNumber = this.spotifyQueue.getCurrentTrackNumber();
        console.log(`Track skip vote by ${slackUserId}. Track Number: ${currentPlayNumber}`)
        if (currentPlayNumber !== this.trackVoteNumber) {
            this.resetTrackVotes(currentPlayNumber);
        }
        if (this.canSkipTrack(slackUserId)) {
            this.trackVotes.push(slackUserId);
        }
        return this.trackVotes.length >= this.skipThreshold;
    }

    public canSkipGroup(slackUserId: string): boolean {
        const currentGroupName = this.spotifyQueue.getCurrentGroupName();
        const currentGroupNumber = this.spotifyQueue.getCurrentGroupNumber();
        if (!currentGroupName) {
            return false;
        }
        if (currentGroupNumber !== this.groupVoteNumber) {
            this.resetGroupVotes(currentGroupNumber)
        }
        return !this.groupVotes.includes(slackUserId);
    }

    public registerGroupVote(slackUserId: string): boolean {
        const currentGroupNumber = this.spotifyQueue.getCurrentGroupNumber();
        console.log(`Group skip vote by ${slackUserId}. Group Number: ${currentGroupNumber}`)
        if (currentGroupNumber !== this.groupVoteNumber) {
            this.resetGroupVotes(currentGroupNumber);
        }
        if (this.canSkipGroup(slackUserId)) {
            this.groupVotes.push(slackUserId);
        }
        return this.groupVotes.length >= this.skipThreshold;
    }

    private resetTrackVotes(currentPlayNumber: number) {
        this.trackVotes = [];
        this.trackVoteNumber = currentPlayNumber;
    }

    private resetGroupVotes(currentGroupNumber: number) {
        this.groupVotes = [];
        this.groupVoteNumber = currentGroupNumber;
    }
}
