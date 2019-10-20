import { RTMClient } from "@slack/rtm-api";
import { WebClient } from "@slack/web-api";

import SpotifyQueue from "./spotifyQueue";
import SkipVoter from "./skipVoter";
import identifySpotifyResource from "./identifySpotifyResource";
import config from "./config";

const SLACK_BOT_TOKEN = config.get("SLACK_BOT_TOKEN");
const SKIP_THRESHOLD = config.get("SKIP_THRESHOLD");
const BROADCAST_CHANNEL = config.get("BROADCAST_CHANNEL");

interface ICommandResponse {
    success: boolean;
    type?: "broadcast" | "message";
    message?: string;
}

function isDM(channelId: string): boolean {
    return channelId.startsWith("D");
}

export default class SlackBot {
    private spotifyQueue: SpotifyQueue;
    private skipVoter: SkipVoter;
    private rtmClient: RTMClient;
    private webClient: WebClient;

    private commands = {
        help(slackBot: SlackBot): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                resolve({
                    success: true,
                    type: "message",
                    message: `
All commands must be DM'd to me.
\`add <URL/URI> <optional limit>\` - Adds a track, album or playlist using a Spotify URL or URI. If the resource is an album or playlist, the optional command limit specifies how many tracks to add.
\`resume <optional force>\` - Resumes playback from the next track in the queue
\`stop\` - Stops playback
\`clear\` - Clears the queue
\`status\` - Display the currently playing track and the first ten tracks in the queue
\`skip <optional album/group/playlist>\` - Vote to skip the current track, ${SKIP_THRESHOLD} vote(s) are required. If the optional album/group/playlist (interchangeable) argument is given, votes to skip the current album / playlist.
\`showdevices\` - Show currently available device ids
\`setdevice\` - Set device id to play from
`
                });
            });
        },

        ping(slackBot: SlackBot): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                resolve({
                    success: true
                });
            });
        },

        add(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const resourceString = params[0];
                const limit = params[1] ? +params[1] : null;
                const resource = identifySpotifyResource(resourceString);
                if (resource) {
                    slackBot.spotifyQueue
                        .addResourceToQueue(resource, userId, limit)
                        .then(function(result) {
                            if (result.success) {
                                resolve({
                                    success: true,
                                    type: "broadcast",
                                    message: `<@${userId}> added ${result.message} to queue.`
                                });
                            } else {
                                resolve({
                                    success: false,
                                    type: "message",
                                    message: result.message
                                });
                            }
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                type: "message",
                                message: `Unspecified error with request.`
                            });
                        });
                }
            });
        },

        resume(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const isActive = slackBot.spotifyQueue.isActive();
                if (!isActive || params[0] === "force") {
                    slackBot.spotifyQueue
                        .playNextTrack()
                        .then(function(result) {
                            if (result.success) {
                                resolve({
                                    success: true,
                                    type: "broadcast",
                                    message:
                                        params[0] !== "force"
                                            ? `<@${userId}> resumed playback.`
                                            : `<@${userId}> forced the next track.`
                                });
                            } else {
                                resolve({
                                    success: false,
                                    type: "message",
                                    message: result.message
                                });
                            }
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                type: "message",
                                message: `Unspecified error with request.`
                            });
                        });
                } else {
                    resolve({
                        success: false,
                        type: "message",
                        message: "Already playing, use `resume force` to force"
                    });
                }
            });
        },

        stop(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue
                    .stop()
                    .then(function(result) {
                        if (result.success) {
                            resolve({
                                success: true,
                                type: "broadcast",
                                message: `<@${userId}> stopped playback.`
                            });
                        } else {
                            resolve({
                                success: false,
                                type: "message",
                                message: result.message
                            });
                        }
                    })
                    .catch(function(error) {
                        console.error(error);
                        resolve({
                            success: false,
                            type: "message",
                            message: `Unspecified error with request.`
                        });
                    });
            });
        },

        clear(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue.clearQueue();
                resolve({
                    success: true,
                    type: "broadcast",
                    message: `<@${userId}> cleared the queue.`
                });
            });
        },

        status(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const queueString = slackBot.spotifyQueue.getStatusString();
                resolve({
                    success: true,
                    type: "message",
                    message: queueString
                });
            });
        },

        skip(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                if (slackBot.spotifyQueue.isActive()) {
                    let skipGroup = params[0] === "group" || params[0] === "album" || params[0] === "playlist";
                    if (skipGroup) {
                        if (!slackBot.spotifyQueue.getCurrentGroupName()) {
                            skipGroup = false;
                        }
                    }
                    const currentName = skipGroup
                        ? slackBot.spotifyQueue.getCurrentGroupName()
                        : slackBot.spotifyQueue.getCurrentTrackName();
                    const typeSkipped = skipGroup ? "album or playlist" : "track";
                    const canSkip = skipGroup
                        ? slackBot.skipVoter.canSkipGroup(userId)
                        : slackBot.skipVoter.canSkipTrack(userId);
                    if (canSkip) {
                        const doSkip = skipGroup
                            ? slackBot.skipVoter.registerGroupVote(userId)
                            : slackBot.skipVoter.registerTrackVote(userId);
                        if (doSkip) {
                            if (skipGroup) {
                                slackBot.spotifyQueue.removeCurrentGroupFromQueue();
                            }
                            const queueLength = slackBot.spotifyQueue.getQueueLength();
                            const spotifyAction =
                                queueLength > 0 ? slackBot.spotifyQueue.playNextTrack() : slackBot.spotifyQueue.stop();
                            spotifyAction
                                .then(function(result) {
                                    if (result.success) {
                                        resolve({
                                            success: true,
                                            type: "broadcast",
                                            message: `<@${userId}> voted to skip the current ${typeSkipped}. Now skipping ${currentName}.`
                                        });
                                    } else {
                                        resolve({
                                            success: false,
                                            type: "message",
                                            message: `Error skipping the current ${typeSkipped}: ${result.message}`
                                        });
                                    }
                                })
                                .catch(function(error) {
                                    console.error(error);
                                    resolve({
                                        success: false,
                                        type: "message",
                                        message: `Unspecified error with request.`
                                    });
                                });
                        } else {
                            resolve({
                                success: true,
                                type: "broadcast",
                                message: `<@${userId}> voted to skip the current ${typeSkipped}: ${currentName}.`
                            });
                        }
                    } else {
                        resolve({
                            success: false,
                            type: "message",
                            message: `You have already voted to skip this ${typeSkipped}.`
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        type: "message",
                        message: `Spotify is not currently playing.`
                    });
                }
            });
        },

        showdevices(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue
                    .getDevicesString()
                    .then(function(response) {
                        resolve({
                            success: response.success,
                            type: "message",
                            message: response.message
                        });
                    })
                    .catch(function(error) {
                        console.error(error);
                        resolve({
                            success: false,
                            type: "message",
                            message: `Unspecified error with request.`
                        });
                    });
            });
        },

        setdevice(slackBot: SlackBot, params: string[], userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue
                    .setDeviceId(params[0])
                    .then(function(response) {
                        if (response.success) {
                            resolve({
                                success: true,
                                type: "broadcast",
                                message: `<@${userId}> updated the device id.`
                            });
                        } else {
                            resolve({
                                success: false,
                                type: "message",
                                message: response.message
                            });
                        }
                    })
                    .catch(function(error) {
                        console.error(error);
                        resolve({
                            success: false,
                            type: "message",
                            message: `Unspecified error with request.`
                        });
                    });
            });
        }
    };

    constructor(spotifyQueue) {
        this.spotifyQueue = spotifyQueue;
        this.skipVoter = new SkipVoter(spotifyQueue, SKIP_THRESHOLD);
        this.rtmClient = new RTMClient(SLACK_BOT_TOKEN);
        this.webClient = new WebClient(SLACK_BOT_TOKEN);
    }

    public listenForMessages(): void {
        const slackBot = this;
        this.rtmClient.on("message", function(event) {
            slackBot.messageRecieved(event);
        });
        this.rtmClient.start();
    }

    private processCommand(userId: string, command: string, params: string[]): Promise<ICommandResponse> {
        const slackBot = this;
        if (slackBot.commands.hasOwnProperty(command)) {
            return slackBot.commands[command](slackBot, params, userId);
        }
        return Promise.resolve({
            type: "message",
            success: false,
            message: `*Error:* Command \`${command}\` not found`
        });
    }

    private handleResponse(event, response: ICommandResponse) {
        const slackBot = this;
        slackBot.webClient.reactions.add({
            channel: event.channel,
            name: response.success ? "heavy_check_mark" : "x",
            timestamp: event.ts
        });
        if (response.type === "message" || response.type === "broadcast") {
            const channel =
                response.type === "broadcast" && BROADCAST_CHANNEL !== null ? BROADCAST_CHANNEL : event.channel;
            slackBot.rtmClient.addOutgoingEvent(true, "message", {
                text: response.message,
                channel
            });
        }
    }

    private messageRecieved(event) {
        const slackBot = this;
        if (event.text) {
            const message = event.text;
            if (isDM(event.channel)) {
                const components: string[] = message.split(" ");
                const command = components[0];
                const params = components.slice(1, components.length);
                this.processCommand(event.user, command, params)
                    .then(function(response) {
                        slackBot.handleResponse(event, response);
                    })
                    .catch(function(error) {
                        console.error("Command error " + error);
                    });
            }
        }
    }
}
