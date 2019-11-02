import { RTMClient } from "@slack/rtm-api";
import { WebClient } from "@slack/web-api";

import { SpotifyQueue, ISearchResult } from "./spotifyQueue";
import SkipVoter from "./skipVoter";
import identifySpotifyResource from "./identifySpotifyResource";
import config from "./config";
import { rejects } from "assert";

const SLACK_BOT_TOKEN = config.get("SLACK_BOT_TOKEN");
const SKIP_THRESHOLD = config.get("SKIP_THRESHOLD");
const BROADCAST_CHANNEL = config.get("BROADCAST_CHANNEL");

const SEARCH_RESULT_EMOJIS = ["one", "two", "three", "four", "five", "six"];

interface ICommandResponse {
    success: boolean;
    type?: "broadcast" | "message";
    message?: string;
}

function isDM(channelId: string): boolean {
    return channelId.startsWith("D");
}

function generateSearchResultString(query: string, searchResults: ISearchResult[]): string {
    let resultsString = `Results for \`${query}\`\nReact to add to queue`;
    let lastType = "";
    for (const [index, result] of searchResults.entries()) {
        if (lastType !== result.type) {
            const typeHeader = result.type === "track" ? "Tracks" : result.type === "album" ? "Albums" : "";
            resultsString += `\n\n*${typeHeader}:*`;
            lastType = result.type;
        }
        const emoji = SEARCH_RESULT_EMOJIS[index];
        resultsString += `\n:${emoji}: ${result.name}`;
    }
    return resultsString;
}

export default class SlackBot {
    private spotifyQueue: SpotifyQueue;
    private skipVoter: SkipVoter;
    private rtmClient: RTMClient;
    private webClient: WebClient;
    private searchResults?: ISearchResult[];
    private searchResultsMessageTs?: string;

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
                if (limit !== null && Number.isNaN(limit)) {
                    resolve({
                        success: false,
                        type: "message",
                        message: "Limit is not a number."
                    });
                }
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
                } else {
                    resolve({
                        success: false,
                        type: "message",
                        message: "Invalid resource."
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
        },

        search(slackBot: SlackBot, params: string[], userId: string, channel: string): Promise<ICommandResponse> {
            return new Promise(function(resolve) {
                const query = params.join(" ");
                slackBot.spotifyQueue
                    .searchForItem(query)
                    .then(function(response) {
                        if (response.success) {
                            slackBot
                                .handleSearchResults(query, response.searchResults, channel)
                                .then(function() {
                                    resolve({
                                        success: true
                                    });
                                })
                                .catch(function() {
                                    resolve({
                                        success: false,
                                        type: "message",
                                        message: "Failed to process search request"
                                    });
                                });
                        } else {
                            resolve({
                                success: false,
                                type: "message",
                                message: "Search request failed"
                            });
                        }
                    })
                    .catch(function(error) {
                        console.error(error);
                        resolve({
                            success: false,
                            type: "message",
                            message: "Unspecified error with request."
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

    private handleSearchResults(query: string, searchResults: ISearchResult[], channel: string): Promise<null> {
        const slackBot = this;
        return new Promise(function(resolve, reject) {
            const resultsString = generateSearchResultString(query, searchResults);

            slackBot.rtmClient
                .addOutgoingEvent(true, "message", {
                    text: resultsString,
                    channel
                })
                .then(function(response) {
                    if (response.ts) {
                        slackBot.searchResults = searchResults;
                        slackBot.searchResultsMessageTs = response.ts;
                        resolve();
                    } else {
                        console.error("Slack rejected search results message");
                        reject();
                    }
                })
                .catch(function(error) {
                    console.error("Failed to send search results message");
                    console.error(error);
                    reject();
                });
        });
    }

    private handleSearchResultReaction(emoji: string, userId: string) {
        const slackBot = this;
        if (slackBot.searchResults) {
            const resultIndex = SEARCH_RESULT_EMOJIS.indexOf(emoji);
            if (resultIndex !== -1) {
                const resource = slackBot.searchResults[resultIndex];
                if (resource) {
                    slackBot.spotifyQueue.addResourceToQueue(resource, userId).catch(function(error) {
                        console.error(error);
                    });
                }
            }
        }
    }

    public listenForMessages(): void {
        const slackBot = this;
        this.rtmClient.on("message", function(event) {
            slackBot.messageRecieved(event);
        });
        this.rtmClient.on("reaction_added", function(event) {
            slackBot.reactionAdded(event);
        });
        this.rtmClient.start();
        this.sendMessage(BROADCAST_CHANNEL, "Bot online. DM commands to me to begin playing.");
        process.on("SIGINT", function() {
            slackBot.sendMessage(BROADCAST_CHANNEL, "Bot shutting down.");
            process.exit();
        });
    }

    private processCommand(
        userId: string,
        channel: string,
        command: string,
        params: string[]
    ): Promise<ICommandResponse> {
        const slackBot = this;
        if (slackBot.commands.hasOwnProperty(command)) {
            return slackBot.commands[command](slackBot, params, userId, channel);
        }
        return Promise.resolve({
            type: "message",
            success: false,
            message: `*Error:* Command \`${command}\` not found`
        });
    }

    private sendMessage(channel: string, message: string) {
        const slackBot = this;
        slackBot.rtmClient.addOutgoingEvent(true, "message", {
            text: message,
            channel
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
            this.sendMessage(channel, response.message);
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
                this.processCommand(event.user, event.channel, command, params)
                    .then(function(response) {
                        slackBot.handleResponse(event, response);
                    })
                    .catch(function(error) {
                        console.error("Command error " + error);
                    });
            }
        }
    }

    private reactionAdded(event) {
        const slackBot = this;
        if (event.item) {
            if (event.item.ts === slackBot.searchResultsMessageTs) {
                slackBot.handleSearchResultReaction(event.reaction, event.user);
            }
        }
    }
}
