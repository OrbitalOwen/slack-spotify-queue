import SpotifyQueue from "./spotifyQueue";

export default class SkipVoter {
    private spotifyQueue: SpotifyQueue;
    private votePlayNumber: number;
    private votes: string[];
    private skipThreshold: number;

    constructor(spotifyQueue, skipThreshold) {
        this.spotifyQueue = spotifyQueue;
        this.skipThreshold = skipThreshold;
        this.votePlayNumber = 0;
        this.votes = [];
    }

    public canSkip(slackUserId: string): boolean {
        const currentPlayNumber = this.spotifyQueue.getCurrentPlayNumber();
        if (currentPlayNumber !== this.votePlayNumber) {
            return true;
        }
        return !this.votes.includes(slackUserId);
    }

    public registerVote(slackUserId: string): boolean {
        if (!this.spotifyQueue.isActive()) {
            return false;
        }
        const currentPlayNumber = this.spotifyQueue.getCurrentPlayNumber();
        if (currentPlayNumber !== this.votePlayNumber) {
            this.reset(currentPlayNumber);
        }
        if (this.canSkip(slackUserId)) {
            this.votes.push(slackUserId);
        }
        return this.votes.length >= this.skipThreshold;
    }

    private reset(currentPlayNumber: number) {
        this.votes = [];
        this.votePlayNumber = currentPlayNumber;
    }
}
