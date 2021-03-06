// A safe interface for searching functionality
import winston from "winston";

import { Spotify, ISearchResult } from "./Spotify";
import { Config } from "./Config";
import { Queue } from "./Queue";
import { IActionResult, ICommandResponse } from "./CommandTypes";

export class SearchHandler {
    private spotify: Spotify;
    private queue: Queue;
    private optionEmojis: string[];

    constructor(config: Config, spotify: Spotify, queue: Queue) {
        this.optionEmojis = config.get().OPTION_EMOJIS;
        this.spotify = spotify;
        this.queue = queue;
    }

    private getOutputString(query: string, results: ISearchResult[]) {
        const tracks = results.filter((result) => result.type === "track");
        const albums = results.filter((result) => result.type === "album");

        let outputString = `Results for '${query}':`;

        if (tracks.length > 0) {
            outputString += "\nTracks:";
        }
        for (const [index, track] of Object.entries(tracks)) {
            outputString += `\n:${this.optionEmojis[+index]}: ${track.name}`;
        }

        if (albums.length > 0) {
            outputString += "\nAlbums:";
        }
        for (const [index, album] of Object.entries(albums)) {
            const emojiIndex = +index + tracks.length;
            outputString += `\n:${this.optionEmojis[emojiIndex]}: ${album.name}`;
        }
        outputString += "\nReact to queue";

        return outputString;
    }

    private getOptionCallback(
        results: ISearchResult[]
    ): (index: number, creatorId: string) => Promise<ICommandResponse> {
        const queue = this.queue;
        return async (index: number, creatorId: string) => {
            const result = results[index];
            if (!result) {
                return { success: false, message: `:${this.optionEmojis[index]}: is not a valid response`, type: "dm" };
            }
            try {
                const addResponse = await queue.add(result, creatorId);
                if (addResponse.tracks === 0) {
                    return {
                        success: false,
                        message: `${addResponse.type} ${addResponse.name} is not playable`,
                        type: "dm"
                    };
                }
                return {
                    success: true,
                    message: `<@${creatorId}> added ${addResponse.tracks} tracks from ${addResponse.type} ${addResponse.name} to the queue`,
                    type: "broadcast"
                };
            } catch (error) {
                winston.error("Error queueing from search result", { error });
                return { success: false, message: "Error when queueing", type: "dm" };
            }
        };
    }

    public async search(query: string): Promise<IActionResult> {
        let results: ISearchResult[];
        try {
            results = await this.spotify.search(query);
        } catch (error) {
            winston.error("Error performing search", { error });
            return { success: false, message: "Error when searching" };
        }
        results = results.slice(0, this.optionEmojis.length);
        const message = this.getOutputString(query, results);
        const callback = this.getOptionCallback(results);
        return {
            success: true,
            message,
            callback
        };
    }
}
