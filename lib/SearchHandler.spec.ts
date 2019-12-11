import { SearchHandler } from "./SearchHandler";

import { Spotify } from "./Spotify";
import { Queue } from "./Queue";
import { Config, configTemplate } from "./Config";
import { mocked } from "ts-jest/utils";

jest.mock("./Spotify");
jest.mock("./Config");
jest.mock("./Queue");

const mockedSpotify = mocked(Spotify, true);
const mockedConfig = mocked(Config, true);
const mockedQueue = mocked(Queue, true);

beforeEach(() => {
    mockedConfig.prototype.get.mockReturnValue(
        Object.assign(configTemplate, {
            OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "zero"]
        })
    );
    mockedSpotify.prototype.search.mockResolvedValue([
        { type: "track", name: "track1", id: "id1" },
        { type: "track", name: "track2", id: "id2" },
        { type: "track", name: "track3", id: "id3" },
        { type: "album", name: "album4", id: "id4" },
        { type: "album", name: "album5", id: "id5" },
        { type: "album", name: "album6", id: "id6" }
    ]);
    mockedQueue.prototype.add.mockResolvedValue({
        name: "White Noise Real",
        type: "track",
        creatorId: "creatorId",
        groupId: 0,
        tracks: 1
    });
});

afterEach(() => {
    jest.resetAllMocks();
});

function makeHandler() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    const handler = new SearchHandler(config, spotify, queue);
    return handler;
}

describe("searchHandler.search()", () => {
    test("Should fail if the search failed", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedSpotify.prototype.search.mockRejectedValue(undefined);

        const handler = makeHandler();
        const result = await handler.search("White Noise");

        expect(result.success).toBe(false);
    });

    test("Should generate a message with the correct results", async () => {
        const handler = makeHandler();
        const result = await handler.search("White Noise");

        expect(mockedSpotify.prototype.search).toHaveBeenCalledWith("White Noise");

        expect(result.success).toBe(true);
        expect(result.message).toBe(`Results for 'White Noise':
Tracks:
:one: track1
:two: track2
:three: track3
Albums:
:four: album4
:five: album5
:six: album6
React to queue`);
    });

    test("Should work when there are too many results", async () => {
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign(configTemplate, {
                OPTION_EMOJIS: ["one"]
            })
        );

        const handler = makeHandler();
        const result = await handler.search("White Noise");

        expect(result.success).toBe(true);
        expect(result.message).toBe(`Results for 'White Noise':
Tracks:
:one: track1
React to queue`);
    });

    test("Should return a callback that fails if an invalid result is given", async () => {
        const handler = makeHandler();
        const result = await handler.search("White Noise");

        await expect(result.callback(99, "creator")).resolves.toMatchObject({
            success: false
        });
    });

    test("Should return a callback that fails if no tracks could be added", async () => {
        mockedQueue.prototype.add.mockResolvedValue({
            name: "name",
            type: "album",
            creatorId: "creatorId",
            groupId: 0,
            tracks: 0
        });

        const handler = makeHandler();
        const result = await handler.search("White Noise");

        await expect(result.callback(1, "creator")).resolves.toMatchObject({
            success: false
        });
    });

    test("Should return a callback that fails if there's an error adding the result", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedQueue.prototype.add.mockRejectedValue(undefined);

        const handler = makeHandler();
        const result = await handler.search("White Noise");

        await expect(result.callback(1, "creator")).resolves.toMatchObject({
            success: false
        });
    });

    test("Should return a success once the result is added", async () => {
        const handler = makeHandler();
        const result = await handler.search("White Noise");

        const actionResponse = await result.callback(2, "creator");

        expect(actionResponse.success).toBe(true);
        expect(actionResponse.message.includes("creator")).toBe(true);
        expect(actionResponse.message.includes("track")).toBe(true);
        expect(actionResponse.message.includes("White Noise Real")).toBe(true);

        expect(mockedQueue.prototype.add).toHaveBeenCalled();
        expect(mockedQueue.prototype.add.mock.calls[0][0]).toEqual({ type: "track", name: "track3", id: "id3" });
        expect(mockedQueue.prototype.add.mock.calls[0][1]).toEqual("creator");
    });
});
