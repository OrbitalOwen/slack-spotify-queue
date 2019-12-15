import { mocked } from "ts-jest/utils";

import { NowPlaying } from "./NowPlaying";
import { Config } from "./Config";
import { Spotify } from "./Spotify";
import { Queue } from "./Queue";
import prettyMilliseconds = require("pretty-ms");

jest.mock("./Queue");
jest.mock("./Spotify");
jest.mock("./Config");
jest.mock("pretty-ms");

const mockedQueue = mocked(Queue, true);
const mockedPrettyMilliseconds = mocked(prettyMilliseconds, true);

beforeEach(() => {
    mockedPrettyMilliseconds.mockReturnValue("mm:ss");
});

afterEach(() => {
    jest.resetAllMocks();
});

function get() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    const nowPlaying = new NowPlaying(queue);
    return nowPlaying.get();
}

describe("NowPlaying.get()", () => {
    test("Should work if nothing is playing", () => {
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getCurrentEntry.mockReturnValue(undefined);
        mockedQueue.prototype.getQueue.mockReturnValue([]);

        expect(get()).toBe(`*Paused:* Nothing\n*Queue:*`);
    });

    test("Should work if a track is playing", () => {
        mockedQueue.prototype.isPlaying.mockReturnValue(true);
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "track_name",
            uri: "uri",
            creatorId: "creator_id",
            queueId: 1,
            groupId: 1,
            durationMs: 100,
            isPlayable: true
        });
        mockedQueue.prototype.getQueue.mockReturnValue([]);

        expect(get()).toBe(`*Now Playing:* track_name - mm:ss (<creator_id>)\n*Queue:*`);
    });

    test("Should show the queue", () => {
        const entry = {
            name: "track_name",
            uri: "uri",
            creatorId: "creator_id",
            queueId: 1,
            groupId: 1,
            durationMs: 100,
            isPlayable: true
        };
        mockedQueue.prototype.getCurrentEntry.mockReturnValue(undefined);
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getQueue.mockReturnValue(Array(7).fill(entry));

        expect(get()).toBe(`*Paused:* Nothing\n*Queue:*
1: track_name - mm:ss (<creator_id>)
2: track_name - mm:ss (<creator_id>)
3: track_name - mm:ss (<creator_id>)
4: track_name - mm:ss (<creator_id>)
5: track_name - mm:ss (<creator_id>)
6: track_name - mm:ss (<creator_id>)
7: track_name - mm:ss (<creator_id>)`);
    });

    test("Should show the remainder if any", () => {
        const entry = {
            name: "track_name",
            uri: "uri",
            creatorId: "creator_id",
            queueId: 1,
            groupId: 1,
            durationMs: 100,
            isPlayable: true
        };
        mockedQueue.prototype.getCurrentEntry.mockReturnValue(undefined);
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getQueue.mockReturnValue(Array(12).fill(entry));

        expect(get()).toBe(`*Paused:* Nothing\n*Queue:*
1: track_name - mm:ss (<creator_id>)
2: track_name - mm:ss (<creator_id>)
3: track_name - mm:ss (<creator_id>)
4: track_name - mm:ss (<creator_id>)
5: track_name - mm:ss (<creator_id>)
6: track_name - mm:ss (<creator_id>)
7: track_name - mm:ss (<creator_id>)
8: track_name - mm:ss (<creator_id>)
9: track_name - mm:ss (<creator_id>)
10: track_name - mm:ss (<creator_id>)
+2 more`);
    });
});
