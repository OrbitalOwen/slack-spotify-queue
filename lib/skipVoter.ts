import SpotifyQueue from './spotifyQueue'

export default class SkipVoter {
    private spotifyQueue: SpotifyQueue
    private votePlayNumber: number
    private votes: string[]
    private skipThreshold: number

    constructor(spotifyQueue, skipThreshold) {
        this.spotifyQueue = spotifyQueue
        this.skipThreshold = skipThreshold
        this.votePlayNumber = 0
        this.votes = []
    }

    private reset(currentPlayNumber: number) {
        this.votes = []
        this.votePlayNumber = currentPlayNumber        
    }

    registerVote(slackUserId): boolean {
        if (!this.spotifyQueue.isActive()) {
            return false
        }
        const currentPlayNumber = this.spotifyQueue.getCurrentPlayNumber() 
        if (currentPlayNumber != this.votePlayNumber) {
            this.reset(currentPlayNumber)
        }
        if (!this.votes.includes(slackUserId)) {
            this.votes.push(slackUserId)
        }
        return (this.votes.length >= this.skipThreshold)
    }
}