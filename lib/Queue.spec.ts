import { Queue } from "./Queue";
import { Config, IConfig, configTemplate } from "./Config";
import { Spotify } from "./Spotify";
import { IResource } from "./identifySpotifyResource";
import { mocked } from "ts-jest/utils";

jest.mock("./Spotify");
jest.mock("./Config");

const mockedSpotify = mocked(Spotify, true);
const mockedConfig = mocked(Config, true);

function mockSpotify() {
    mockedSpotify.prototype.getTrack.mockResolvedValue({
        name: "track_name",
        uri: "track_uri",
        durationMs: 0,
        isPlayable: true
    });
    mockedSpotify.prototype.pause.mockResolvedValue();
    mockedSpotify.prototype.play.mockResolvedValue();
    mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
        isPlaying: true,
        progressMs: 100,
        trackUri: "track_uri"
    });
}

function mockConfig(config?: object) {
    const configValue: IConfig = Object.assign({}, configTemplate, config ? config : {});
    mockedConfig.prototype.get.mockReturnValue(configValue);
}

function makeQueue() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    (queue as any).playing = false;
    return queue;
}

async function addTrack(queue: Queue, name: string, id: string, uri: string, creatorId: string, durationMs: number) {
    mockedSpotify.prototype.getTrack.mockResolvedValue({
        name,
        uri,
        durationMs,
        isPlayable: true
    });
    const resource: IResource = {
        type: "track",
        id
    };
    return await queue.add(resource, creatorId);
}

beforeEach(() => {
    jest.clearAllTimers();
    jest.useFakeTimers();
    mockSpotify();
    mockConfig();
});

afterEach(() => {
    jest.resetAllMocks();
});

describe("Queue.add()", () => {
    test("Should add a track to the queue", async () => {
        const queue = makeQueue();
        const resource: IResource = {
            type: "track",
            id: "id_1"
        };
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);

        expect(mockedSpotify.prototype.getTrack).toBeCalledWith("track_id");
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(1);
        expect(currentQueue).toEqual([
            {
                name: "track_name",
                uri: "track_uri",
                durationMs: 0,
                creatorId: "creator_id",
                queueId: 1,
                groupId: 1,
                isPlayable: true
            }
        ]);
    });

    test("Subsequent track's queueIds should increase", async () => {
        const queue = makeQueue();

        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);

        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(3);
        expect(currentQueue[0].queueId).toBe(1);
        expect(currentQueue[1].queueId).toBe(2);
        expect(currentQueue[2].queueId).toBe(3);
    });

    test("Should add the tracks from an album to the queue, with a shared groupId and group name", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getAlbum.mockResolvedValue({
            name: "album_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        const resource: IResource = {
            type: "album",
            id: "id_1"
        };
        await queue.add(resource, "creator_id");
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(2);
        expect(currentQueue[0]).toEqual({
            name: "track_name_1",
            uri: "track_uri_1",
            durationMs: 1,
            creatorId: "creator_id",
            groupId: 1,
            queueId: 1,
            isPlayable: true,
            groupName: "album_name"
        });
        expect(currentQueue[1]).toEqual({
            name: "track_name_2",
            uri: "track_uri_2",
            durationMs: 1,
            creatorId: "creator_id",
            groupId: 1,
            queueId: 2,
            isPlayable: true,
            groupName: "album_name"
        });
    });

    test("Should add the tracks from a playlist to the queue, with a shared groupId", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getPlaylist.mockResolvedValue({
            name: "playlist_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        const resource: IResource = {
            type: "playlist",
            id: "id_1"
        };
        await queue.add(resource, "creator_id");
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(2);
        expect(currentQueue[0]).toEqual({
            name: "track_name_1",
            uri: "track_uri_1",
            durationMs: 1,
            creatorId: "creator_id",
            groupId: 1,
            queueId: 1,
            isPlayable: true,
            groupName: "playlist_name"
        });
        expect(currentQueue[1]).toEqual({
            name: "track_name_2",
            uri: "track_uri_2",
            durationMs: 1,
            creatorId: "creator_id",
            groupId: 1,
            queueId: 2,
            isPlayable: true,
            groupName: "playlist_name"
        });
    });

    test("Should not add more than limit tracks, if present", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getPlaylist.mockResolvedValue({
            name: "playlist_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        const resource: IResource = {
            type: "playlist",
            id: "id_1"
        };
        await queue.add(resource, "creator_id", 1);
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(1);
    });

    test("If no limit is given, should default to the limit defined in config", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getPlaylist.mockResolvedValue({
            name: "playlist_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        mockConfig({ DEFAULT_TRACK_LIMIT: 1 });
        const resource: IResource = {
            type: "playlist",
            id: "id_1"
        };
        await queue.add(resource, "creator_id");
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(1);
    });

    test("Should return info on the entry added when adding a track", async () => {
        const queue = makeQueue();
        const addResponse = await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        expect(addResponse).toEqual({
            name: "track_name",
            creatorId: "creator_id",
            type: "track",
            groupId: 1,
            tracks: 1
        });
    });

    test("Should return info on the entry added when adding a playlist", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getPlaylist.mockResolvedValue({
            name: "playlist_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        const resource: IResource = {
            type: "playlist",
            id: "id_1"
        };
        const addResponse = await queue.add(resource, "creator_id");
        expect(addResponse).toEqual({
            name: "playlist_name",
            creatorId: "creator_id",
            type: "playlist",
            groupId: 1,
            tracks: 2
        });
    });

    test("Should return info on the entry added when adding an album", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getAlbum.mockResolvedValue({
            name: "album_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: true
                },
                {
                    name: "track_name_2",
                    uri: "track_uri_2",
                    durationMs: 1,
                    isPlayable: true
                }
            ]
        });
        const resource: IResource = {
            type: "album",
            id: "id_1"
        };
        const addResponse = await queue.add(resource, "creator_id");
        expect(addResponse).toEqual({
            name: "album_name",
            creatorId: "creator_id",
            type: "album",
            groupId: 1,
            tracks: 2
        });
    });

    test("Should not add unplayable album entries", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getAlbum.mockResolvedValue({
            name: "album_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: false
                }
            ]
        });
        const resource: IResource = {
            type: "album",
            id: "id_1"
        };
        const addResponse = await queue.add(resource, "creator_id");
        expect(queue.getQueue().length).toBe(0);
        expect(addResponse).toEqual({
            name: "album_name",
            creatorId: "creator_id",
            type: "album",
            groupId: 1,
            tracks: 0
        });
    });

    test("Should not add unplayable playlist entries", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getPlaylist.mockResolvedValue({
            name: "playlist_name",
            tracks: [
                {
                    name: "track_name_1",
                    uri: "track_uri_1",
                    durationMs: 1,
                    isPlayable: false
                }
            ]
        });
        const resource: IResource = {
            type: "playlist",
            id: "id_1"
        };
        const addResponse = await queue.add(resource, "creator_id");
        expect(queue.getQueue().length).toBe(0);
        expect(addResponse).toEqual({
            name: "playlist_name",
            creatorId: "creator_id",
            type: "playlist",
            groupId: 1,
            tracks: 0
        });
    });

    test("Should not add unplayable track entries", async () => {
        const queue = makeQueue();
        mockedSpotify.prototype.getTrack.mockResolvedValue({
            name: "track_name",
            uri: "track_uri",
            durationMs: 1,
            isPlayable: false
        });
        const resource: IResource = {
            type: "track",
            id: "id_1"
        };
        const addResponse = await queue.add(resource, "creator_id");
        expect(queue.getQueue().length).toBe(0);
        expect(addResponse).toEqual({
            name: "track_name",
            creatorId: "creator_id",
            type: "track",
            groupId: 1,
            tracks: 0
        });
    });

    test("Should play the track only if it is added to an empty queue whilst playing is true", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);

        expect(nextTrackSpy).toHaveBeenCalled();

        (queue as any).playing = false;
        nextTrackSpy.mockClear();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);

        expect(nextTrackSpy).not.toHaveBeenCalled();

        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1,
            pausedProgressMs: 50
        };
        nextTrackSpy.mockClear();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);

        expect(nextTrackSpy).not.toHaveBeenCalled();
    });
});

describe("Queue.nextTrack()", () => {
    test("Should play the first entry in the queue", async () => {
        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await queue.nextTrack();
        const currentEntry = queue.getCurrentEntry();
        const isPlaying = queue.isPlaying();
        expect(mockedSpotify.prototype.play).toBeCalledWith("track_uri");
        expect(currentEntry.uri).toBe("track_uri");
        expect(isPlaying).toBe(true);
    });

    test("If the queue is empty, should set currentEntry to undefined", async () => {
        const queue = makeQueue();

        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await queue.nextTrack();
        await queue.nextTrack();

        const currentEntry = queue.getCurrentEntry();
        expect(currentEntry).toBe(undefined);
    });

    test("If playback is successful, should advance the queue", async () => {
        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await queue.nextTrack();
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(1);
        expect(currentQueue[0].queueId).toBe(2);
    });

    test("If playback is not successful, should not advance the queue", async () => {
        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        mockedSpotify.prototype.play.mockRejectedValue(null);
        await expect(queue.nextTrack()).rejects.toBe(null);
        const currentQueue = queue.getQueue();
        expect(currentQueue.length).toBe(2);
        expect(currentQueue[0].queueId).toBe(1);
    });

    test("If playback is successful, should set playing to true", async () => {
        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        await queue.nextTrack();
        expect(queue.isPlaying()).toBe(true);
    });

    test("If playback is not successful, should not set playing to true", async () => {
        const queue = makeQueue();
        (queue as any).playing = false;
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        mockedSpotify.prototype.play.mockRejectedValue(null);
        await expect(queue.nextTrack()).rejects.toBe(null);
        expect(queue.isPlaying()).toBe(false);
    });

    test("Should return the currently playing entry", async () => {
        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 0);
        const entry = await queue.nextTrack();
        expect(entry).toEqual({
            name: "track_name",
            uri: "track_uri",
            creatorId: "creator_id",
            durationMs: 0,
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });
    });

    test("Should call advanceTrackIfOver with the queueEntry after the track's duration", async () => {
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            progressMs: 0,
            trackUri: ""
        });

        const queue = makeQueue();
        await addTrack(queue, "track_name", "track_id", "track_uri", "creator_id", 100);
        const advanceTrackSpy = jest.spyOn(queue as any, "advanceTrackIfOver");
        const queueEntry = await queue.nextTrack();
        jest.advanceTimersByTime(100);
        await Promise.resolve();
        expect(advanceTrackSpy).toHaveBeenCalled();
        expect(advanceTrackSpy.mock.calls[0][0]).toEqual(queueEntry);
    });
});

describe("checkIfTrackOverWithRetry()", () => {
    test("Should get the current playback status", async () => {
        const queue = makeQueue();
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 0
        });
        expect(mockedSpotify.prototype.getPlaybackInfo).toHaveBeenCalled();
    });

    test("Should return if queue is not currently playing", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = false;
        (queue as any).queueId = 1;
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 0
        });
        jest.runAllTimers();
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(0);
    });

    test("Should return if the queue has moved on", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            queueId: 3,
            uri: "track_uri",
            durationMs: 0
        };
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 2,
            uri: "track_uri",
            durationMs: 0
        });
        jest.runAllTimers();
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(0);
    });

    test("Should return if spotify is playing a different track", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "a_different_track_uri",
            progressMs: 100
        });
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 100
        });
        jest.runAllTimers();
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(0);
    });

    test("If the track has ended, should play the next track", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 100
        });
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 100
        });
        jest.runAllTimers();
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(1);
    });

    test("If the track has not ended, should try again after the remaining duration has elapsed", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 8000
        });
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 10000
        });
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1999);
        expect(nextTrackSpy).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(1);
        expect(checkTrackSpy).toHaveBeenCalledTimes(2);
    });

    test("If the track has not ended, should wait at least 1000ms before checking again", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 99
        });
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 100
        });
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(0);
        jest.advanceTimersByTime(1);
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        jest.advanceTimersByTime(1000);
        expect(checkTrackSpy).toHaveBeenCalledTimes(2);
    });

    test("If no progress is given by spotify, should assume the track is over", async () => {
        const queue = makeQueue();
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri"
        });
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 100
        });
        expect(checkTrackSpy).toHaveBeenCalledTimes(1);
        expect(nextTrackSpy).toHaveBeenCalledTimes(1);
    });

    test("Should retry after 2 seconds if there is an error checking if the track is over", async () => {
        const queue = makeQueue();
        const checkTrackSpy = jest.spyOn(queue as any, "checkIfTrackOverWithRetry");
        (queue as any).playing = true;
        (queue as any).queueId = 1;
        mockedSpotify.prototype.getPlaybackInfo.mockRejectedValue(undefined);
        await (queue as any).checkIfTrackOverWithRetry({
            queueId: 1,
            uri: "track_uri",
            durationMs: 100
        });
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri"
        });
        jest.advanceTimersByTime(2001);
        expect(checkTrackSpy).toHaveBeenCalledTimes(2);
        jest.advanceTimersByTime(2001);
        expect(checkTrackSpy).toHaveBeenCalledTimes(2);
    });
});

describe("Queue.removeTracks()", () => {
    test("Should remove the entry with the given queueIds from the queue", async () => {
        const queue = makeQueue();
        (queue as any).queue = [
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 4, groupId: 2 }
        ];
        await queue.removeTracks([2, 3]);
        expect(queue.getQueue()).toEqual([{ name: "", uri: "", durationMs: 0, creatorId: "", queueId: 4, groupId: 2 }]);
    });

    test("If the entries being removed includes the current track, should move to the next track", async () => {
        const queue = makeQueue();
        (queue as any).currentEntry = { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 };
        const nextTrackSpy = jest.spyOn(queue, "nextTrack");
        await queue.removeTracks([2]);
        expect(nextTrackSpy).toHaveBeenCalled();
    });
});

describe("Queue.stop()", () => {
    test("Should pause spotify", async () => {
        const queue = makeQueue();
        await queue.stop();
        expect(mockedSpotify.prototype.pause).toHaveBeenCalled();
    });
});

describe("Queue.pause()", () => {
    test("Should throw an error if the queue is not playing", async () => {
        const queue = makeQueue();
        (queue as any).playing = false;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 100
        });
        await expect(queue.pause()).rejects.toEqual(expect.any(Error));
    });

    test("If there is no current entry, should set playing to false and return", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = undefined;

        await queue.pause();

        expect(queue.isPlaying()).toBe(false);
        expect(mockedSpotify.prototype.pause).not.toHaveBeenCalled();
    });

    test("Should throw an error ir spotify is not currently playing", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: false,
            trackUri: "track_uri",
            progressMs: 100
        });
        await expect(queue.pause()).rejects.toEqual(expect.any(Error));
    });

    test("Should throw an error ir spotify is playing the wrong track", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "wrong_track_uri",
            progressMs: 100
        });
        await expect(queue.pause()).rejects.toEqual(expect.any(Error));
    });

    test("Should throw an error ir spotify does not return progress info", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri"
        });
        await expect(queue.pause()).rejects.toEqual(expect.any(Error));
    });

    test("Should pause spotify", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 50
        });
        await queue.pause();
        expect(mockedSpotify.prototype.pause).toHaveBeenCalled();
    });

    test("Should update the currentEntry with the paused progress", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 50
        });
        await queue.pause();
        const currentEntry = queue.getCurrentEntry();
        expect(currentEntry.pausedProgressMs).toBe(50);
    });

    test("Should not update the currentEntry with the paused progress if the track has ended", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 100
        });
        await queue.pause();
        const currentEntry = queue.getCurrentEntry();
        expect(currentEntry.pausedProgressMs).toBe(undefined);
    });

    test("Should set the queue to not be playing", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            trackUri: "track_uri",
            progressMs: 50
        });
        await queue.pause();
        expect(queue.isPlaying()).toBe(false);
    });
});

describe("Queue.resume()", () => {
    test("Should throw an error if the queue is already playing", async () => {
        const queue = makeQueue();
        (queue as any).playing = true;
        (queue as any).currentEntry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1
        };
        await expect(queue.resume()).rejects.toEqual(expect.any(Error));
    });

    test("Should throw an error if there is no current track", async () => {
        const queue = makeQueue();
        (queue as any).playing = false;
        await expect(queue.resume()).rejects.toEqual(expect.any(Error));
    });

    test("Should resume correctly", async () => {
        const queue = makeQueue();
        (queue as any).playing = false;
        const entry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1,
            pausedProgressMs: 50
        };
        (queue as any).currentEntry = entry;
        const returnedEntry = await queue.resume();
        expect(mockedSpotify.prototype.play).toHaveBeenCalledWith("track_uri", 50);
        expect(queue.isPlaying()).toBe(true);
        expect(returnedEntry).toEqual(entry);
    });

    test("Should call advanceTrackIfOver with the queueEntry after the track's duration", async () => {
        mockedSpotify.prototype.getPlaybackInfo.mockResolvedValue({
            isPlaying: true,
            progressMs: 0,
            trackUri: ""
        });

        const queue = makeQueue();
        (queue as any).playing = false;
        const entry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1,
            pausedProgressMs: 80
        };
        (queue as any).currentEntry = entry;
        const advanceTrackSpy = jest.spyOn(queue as any, "advanceTrackIfOver");
        const queueEntry = await queue.resume();
        jest.advanceTimersByTime(21);
        await Promise.resolve();
        expect(advanceTrackSpy).toHaveBeenCalled();
        expect(advanceTrackSpy.mock.calls[0][0]).toEqual(queueEntry);
    });
});

describe("Queue.clear()", () => {
    test("Should clear the queue", () => {
        const queue = makeQueue();
        (queue as any).queue = [
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2 }
        ];
        queue.clear();
        expect(queue.getQueue()).toEqual([]);
    });
});

describe("Queue.getQueue()", () => {
    test("Should return a deep copy of the queue", () => {
        const queue = makeQueue();
        const currentQueue = [
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2 }
        ];
        (queue as any).queue = currentQueue;
        const returnedQueue = queue.getQueue();
        expect(returnedQueue).toEqual(currentQueue);
        expect(returnedQueue).not.toBe(currentQueue);
        expect(returnedQueue[0]).not.toBe(currentQueue[0]);
    });
});

describe("Queue.getCurrentEntry()", () => {
    test("Should return a copy of the current entry", () => {
        const queue = makeQueue();
        const entry = {
            name: "",
            uri: "track_uri",
            durationMs: 100,
            creatorId: "",
            queueId: 1,
            groupId: 1,
            pausedProgressMs: 50
        };
        (queue as any).currentEntry = entry;
        const returnedEntry = queue.getCurrentEntry();
        expect(returnedEntry).toEqual(entry);
        expect(returnedEntry).not.toBe(entry);
    });

    test("Should return undefined if there is no current entry", () => {
        const queue = makeQueue();
        expect(queue.getCurrentEntry()).toBe(undefined);
    });
});

describe("Queue.isPlaying()", () => {
    test("Should return if currently playing", () => {
        const queue = makeQueue();
        (queue as any).playing = false;
        expect(queue.isPlaying()).toBe(false);
        (queue as any).playing = true;
        expect(queue.isPlaying()).toBe(true);
    });
});
