// Middleware to interpret and dispatch commands

import { Controller } from "./Controller";
import { SearchHandler } from "./SearchHandler";
import { Votes } from "./Votes";
import { DeviceSelector } from "./DeviceSelector";
import { NowPlaying } from "./NowPlaying";
import { ICommandResponse } from "./CommandTypes";
import { Config, IConfig } from "./Config";

function splitRawCommand(rawString: string) {
    const components = rawString.split(" ");
    const command = components[0];
    const params = components.slice(1, components.length);
    return {
        command,
        params
    };
}

function getDocsString(config: IConfig) {
    return `*List of commands:*\n
- \`search query\` - Search for the given track or album, which can then be added to the queue by reacting to the response.\n
- \`add resource maxTracks\` - Adds the given \`resource\` to the queue, accepting a URL or URI. \`maxTracks\` limits the number of tracks to add from an album or playlist, defaulting to ${config.DEFAULT_TRACK_LIMIT}.\n
- \`play force\` - Resumes the queue if it is paused. If \`force\` is present, will force the next track to play.\n
- \`pause\` - Pauses the current track.\n
- \`volume direction delta\` - Increases or decreases the volume. \`direction\` accepts 'up' and 'down' as values. \`delta\` defaults to ${config.DEFAULT_VOLUME_DELTA}%.\n
- \`skip group\` - Votes to skip the current track. If \`group\` is 'album, 'playlist' or 'group'. Will vote to skip the current album / playlist. Skipping requires ${config.SKIP_THRESHOLD} votes, although a user can skip their own tracks without a vote.\n
- \`status\` - Displays a 'now playing' string including the current track and an overview of the queue.\n
- \`devices\` - Displays the current device, and provides a prompt to select a different one by reacting to the response.\n
- \`help\` - Displays the list of commands you are looking at now.
`;
}

export class CommandHandler {
    private config: Config;
    private controller: Controller;
    private searchHandler: SearchHandler;
    private votes: Votes;
    private deviceSelector: DeviceSelector;
    private nowPlaying: NowPlaying;

    constructor(
        config: Config,
        controller: Controller,
        searchHandler: SearchHandler,
        votes: Votes,
        deviceSelector: DeviceSelector,
        nowPlaying: NowPlaying
    ) {
        this.config = config;
        this.controller = controller;
        this.searchHandler = searchHandler;
        this.votes = votes;
        this.deviceSelector = deviceSelector;
        this.nowPlaying = nowPlaying;
    }

    private async add(userId: string, params: string[]): Promise<ICommandResponse> {
        const resourceString = params[0];
        const limitString: string = params[1];
        if (!resourceString) {
            return { success: false, message: "No resource given", type: "dm" };
        }
        let limitNumber;
        if (limitString) {
            if (Number.isNaN(+limitString)) {
                return { success: false, message: "Limit is not a number", type: "dm" };
            }
            limitNumber = Math.floor(+limitString);
        }
        const result = await this.controller.add(userId, resourceString, limitNumber);
        return {
            success: result.success,
            message: result.message,
            type: result.success ? "broadcast" : "dm"
        };
    }

    private async play(userId: string, params: string[]): Promise<ICommandResponse> {
        const force = params[0] === "force" ? true : false;
        const result = await this.controller.play(userId, force);
        return {
            success: result.success,
            message: result.message,
            type: result.success ? "broadcast" : "dm"
        };
    }

    private async pause(userId: string): Promise<ICommandResponse> {
        const result = await this.controller.pause(userId);
        return {
            success: result.success,
            message: result.message,
            type: result.success ? "broadcast" : "dm"
        };
    }

    private async volume(userId: string, params: string[]): Promise<ICommandResponse> {
        const directionString = params[0];
        let amountString = params[1];
        if (directionString !== "up" && directionString !== "down") {
            return { success: false, message: "Invalid direction given", type: "dm" };
        }
        const isUp = directionString === "up" ? true : false;
        let amountNumber;
        if (amountString) {
            amountString = amountString.replace("%", "");
            if (Number.isNaN(+amountString)) {
                return { success: false, message: "Amount is not a number", type: "dm" };
            }
            amountNumber = Math.floor(+amountString);
        }
        const result = await this.controller.changeVolume(userId, isUp, amountNumber);
        return {
            success: result.success,
            message: result.message,
            type: result.success ? "broadcast" : "dm"
        };
    }

    private async skip(userId: string, params: string[]): Promise<ICommandResponse> {
        const skipGroupString = params[0];
        if (
            skipGroupString &&
            skipGroupString !== "group" &&
            skipGroupString !== "album" &&
            skipGroupString !== "playlist"
        ) {
            return { success: false, message: "Invalid parameter given", type: "dm" };
        }
        const skipGroup = skipGroupString ? true : false;
        const result = await this.votes.skipCurrent(userId, skipGroup);
        return {
            success: result.success,
            message: result.message,
            type: result.success ? "broadcast" : "dm"
        };
    }

    private status(): ICommandResponse {
        return {
            success: true,
            message: this.nowPlaying.get(),
            type: "dm"
        };
    }

    private async devices(userId: string): Promise<ICommandResponse> {
        const option = await this.deviceSelector.promptSelection();
        return {
            success: option.success,
            message: option.message,
            callback: option.callback,
            type: "dm"
        };
    }

    private async search(userId: string, params: string[]): Promise<ICommandResponse> {
        if (params.length === 0) {
            return {
                success: false,
                message: "No search query given",
                type: "dm"
            };
        }
        const query = params.join(" ");
        const option = await this.searchHandler.search(query);
        return {
            success: option.success,
            message: option.message,
            callback: option.callback,
            type: "dm"
        };
    }

    private async help(): Promise<ICommandResponse> {
        const message = getDocsString(this.config.get());
        return {
            success: true,
            message,
            type: "dm"
        };
    }

    public async processCommand(userId: string, rawString: string): Promise<ICommandResponse> {
        const { command, params } = splitRawCommand(rawString);

        switch (command) {
            case "add":
                return await this.add(userId, params);
            case "play":
                return await this.play(userId, params);
            case "pause":
                return await this.pause(userId);
            case "volume":
                return await this.volume(userId, params);
            case "skip":
                return await this.skip(userId, params);
            case "status":
                return this.status();
            case "devices":
                return await this.devices(userId);
            case "search":
                return await this.search(userId, params);
            case "help":
                return await this.help();
            default:
                return {
                    success: false,
                    message: `Invalid command: ${command}`,
                    type: "dm"
                };
        }
    }
}
