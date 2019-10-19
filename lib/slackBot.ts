import { RTMClient } from "@slack/rtm-api";
import { WebClient } from "@slack/web-api";

import SpotifyQueue from "./spotifyQueue";
import SkipVoter from "./skipVoter";
import identifySpotifyResource from "./identifySpotifyResource";
import config from "./config";

const SLACK_BOT_TOKEN = config.get("SLACK_BOT_TOKEN");
const BOT_USER_ID = config.get("BOT_USER_ID");
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
\`add\` - Adds a track, album or playlist using a Spotify URL or URI
\`play\` - Begins playing the queue
\`stop\` - Stops playing the queue
\`clear\` - Clear the queue
\`status\` - Display the currently playing track and the first ten tracks in the queue
\`skip\` - Vote to skip the current track, ${SKIP_THRESHOLD} vote(s) are required
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

        add(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const resource = identifySpotifyResource(params);
                if (resource) {
                    slackBot.spotifyQueue
                        .addResourceToQueue(resource, userId)
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

        play(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const isActive = slackBot.spotifyQueue.isActive();
                if (!isActive || params === "force") {
                    slackBot.spotifyQueue
                        .playNextTrack()
                        .then(function(result) {
                            if (result.success) {
                                resolve({
                                    success: true,
                                    type: "broadcast",
                                    message:
                                        params !== "force"
                                            ? `<@${userId}> started playback.`
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
                        message: "Already playing, use `play force` to force"
                    });
                }
            });
        },

        stop(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
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

        clear(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue.clearQueue();
                resolve({
                    success: true,
                    type: "broadcast",
                    message: `<@${userId}> cleared the queue.`
                });
            });
        },

        status(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const queueString = slackBot.spotifyQueue.getStatusString();
                resolve({
                    success: true,
                    type: "message",
                    message: queueString
                });
            });
        },

        skip(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                if (slackBot.spotifyQueue.isActive()) {
                    if (slackBot.skipVoter.canSkip(userId)) {
                        const doSkip = slackBot.skipVoter.registerVote(userId);
                        if (doSkip) {
                            const currentTrackName = slackBot.spotifyQueue.getCurrentTrackName();
                            slackBot.spotifyQueue
                                .playNextTrack()
                                .then(function(result) {
                                    if (result.success) {
                                        resolve({
                                            success: true,
                                            type: "broadcast",
                                            message: `<@${userId}> voted to skip the current track. Now skipping ${currentTrackName}.`
                                        });
                                    } else {
                                        resolve({
                                            success: false,
                                            type: "message",
                                            message: `Error skipping the current track: ${result.message}`
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
                            const trackName = slackBot.spotifyQueue.getCurrentTrackName();
                            resolve({
                                success: true,
                                type: "broadcast",
                                message: `<@${userId}> voted to skip the current track (${trackName}).`
                            });
                        }
                    } else {
                        resolve({
                            success: false,
                            type: "message",
                            message: `You have already voted to skip this track.`
                        });
                    }
                } else {
                    resolve({
                        success: false,
                        type: "message",
                        message: `No track is currently playing.`
                    });
                }
            });
        },

        showdevices(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
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

        setdevice(slackBot: SlackBot, params: string, userId: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                slackBot.spotifyQueue
                    .setDeviceId(params)
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

    private processCommand(userId: string, command: string, params: string): Promise<ICommandResponse> {
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
                console.log(message);
                const spaceIndex = message.indexOf(" ");
                const hasParams = spaceIndex !== -1;
                const command = hasParams ? message.substring(0, spaceIndex) : message;
                const params = hasParams ? message.substring(spaceIndex + 1) : "";

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
