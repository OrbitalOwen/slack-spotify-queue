import { RTMClient } from '@slack/rtm-api'

import SpotifyQueue from './spotifyQueue'
import SkipVoter from './skipVoter'
import identifySpotifyResource from './identifySpotifyResource'

const botToken: string = process.env.SLACK_BOT_TOKEN
const botUserId: string = process.env.BOT_USER_ID
const skipThreshold: number = Number(process.env.SKIP_THRESHOLD)

function getMessageToBot(text: string): string {
    const botTag = `<@${botUserId.trim()}>`
    if (text.startsWith(botTag)) {
        return text.substring(botTag.length + 1, text.length)
    }
}

function executeCommand(spotifyQueue: SpotifyQueue, skipVoter: SkipVoter, userId: string, command: string, params: string): Promise<any> {
    return new Promise(function(resolve, reject) {
        if (command == 'help') {
            resolve(`
All commands must be directed at me using @

\`add\` - Adds a track, album or playlist using a Spotify URL or URI
\`play\` - Begins playing the queue
\`stop\` - Stops playing the queue
\`clear\` - Clear the queue
\`display\` - Display the first ten tracks in the queue
\`skip\` - Vote to skip the current track, ${skipThreshold} vote(s) are required
            `)
        } else if (command == 'ping') {
            resolve("I'm online!")
        } else if (command == 'add') {
            let resource = identifySpotifyResource(params)
            if (resource) {
                if (resource.type == 'track') {
                    spotifyQueue.addTrackToQueue(resource.id).then(function(trackName) {
                        resolve(`Added ${trackName} to queue`)
                    }).catch(function(error) {
                        reject(error)
                    })
                } else if (resource.type == 'album') {
                    spotifyQueue.addAlbumToQueue(resource.id).then(function(albumInfo) {
                        resolve(`Added ${albumInfo} to queue`)
                    }).catch(function(error) {
                        reject(error)
                    })
                } else if (resource.type == 'playlist') {
                    spotifyQueue.addPlaylistToQueue(resource.id).then(function(playlistInfo) {
                        resolve(`Added ${playlistInfo} to queue`)
                    }).catch(function(error) {
                        reject(error)
                    })
                }
            } else {
                reject('Unrecognised resource')
            }
        } else if (command == 'play') {
            const isActive = spotifyQueue.isActive()
            if (!isActive || params == 'force') {
                spotifyQueue.playNextTrack().then(function(trackName) {
                    resolve(`Now playing ${trackName}`)
                }).catch(function(error) {
                    reject(error)
                })
            } else {
                console.log(params)
                reject('Already playing, use `play force` to force play.')
            }
        } else if (command == 'stop') {
            spotifyQueue.stop().then(function() {
                resolve('Stopped')
            }).catch(function(error) {
                reject(error)
            })
        } else if (command == 'clear') {
            spotifyQueue.clearQueue()
            resolve('Queue cleared')
        } else if (command == 'display') {
            const queueString = spotifyQueue.getQueueString()
            resolve(queueString)
        } else if (command == 'skip') {
            const doSkip = skipVoter.registerVote(userId)
            if (doSkip) {
                const currentTrackName = spotifyQueue.getCurrentTrackName()
                spotifyQueue.playNextTrack().then(function() {
                    resolve(`Skipped ${currentTrackName}`)
                }).catch(function(error) {
                    reject(error)
                })
            } else {
                resolve()
            }
        }
    })
}

function messageRecieved(client: RTMClient, event, spotifyQueue: SpotifyQueue, skipVoter: SkipVoter) {
    if (event.text) {
        const botMessage = getMessageToBot(event.text)
        if (botMessage) {
            const spaceIndex = botMessage.indexOf(' ')
            const hasParams = (spaceIndex != -1)
            let command = hasParams ? botMessage.substring(0, spaceIndex) : botMessage
            let params = hasParams ? botMessage.substring(spaceIndex + 1) : ''

            let thread_ts = event.thread_ts ? event.thread_ts : event.ts

            executeCommand(spotifyQueue, skipVoter, event.user, command, params).then(function(reply) {
                if (reply) {
                    client.addOutgoingEvent(true, 'message', {
                        text: reply,
                        channel: event.channel,
                        thread_ts: thread_ts
                    })
                }
            }).catch(function(errorMessage) {
                client.addOutgoingEvent(true, 'message', {
                    text: '*Error:* ' + errorMessage,
                    channel: event.channel,
                    thread_ts: thread_ts
                })
            })
        }
    }
}

export default class SlackBot {
    private spotifyQueue: SpotifyQueue
    private skipVoter: SkipVoter

    constructor(spotifyQueue) {
        this.spotifyQueue = spotifyQueue
        this.skipVoter = new SkipVoter(spotifyQueue, skipThreshold)
    }

    listenForMessages() {
        const client = new RTMClient(botToken)

        client.on('message', (event) => {
            messageRecieved(client, event, this.spotifyQueue, this.skipVoter)
        });

        client.start()
    }
}