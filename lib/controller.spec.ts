import { Config, configTemplate } from "./Config";
import { Queue } from "./Queue";
import { Spotify } from "./Spotify";
import { Controller } from "./Controller";
import { identifySpotifyResource } from "./identifySpotifyResource";
import { mocked } from "ts-jest/utils";

jest.mock("./Config");
jest.mock("./Queue");
jest.mock("./Spotify");
jest.mock("./identifySpotifyResource");

const mockedQueue = mocked(Queue, true);
const mockedConfig = mocked(Config, true);
const mockedSpotify = mocked(Spotify, true);
const mockedIdentifySpotifyResource = mocked(identifySpotifyResource);

function makeController() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    // The queue constructor is mocked, so we need to add this manually
    (queue as any).spotify = spotify;
    return new Controller(config, queue);
}

beforeEach(() => {
    mockedIdentifySpotifyResource.mockReturnValue({
        type: "track",
        id: "track_id"
    });
    mockedQueue.prototype.add.mockResolvedValue({
        name: "track_name",
        type: "track",
        creatorId: "creator_id",
        groupId: 1,
        tracks: 1
    });
    mockedQueue.prototype.isPlaying.mockReturnValue(false);
    mockedQueue.prototype.getQueue.mockReturnValue([]);
    mockedQueue.prototype.getCurrentEntry.mockReturnValue(null);
    mockedQueue.prototype.nextTrack.mockResolvedValue({
        name: "name",
        creatorId: "creator_id",
        uri: "uri",
        groupId: 1,
        queueId: 1,
        durationMs: 100,
        isPlayable: true
    });
    mockedQueue.prototype.resume.mockResolvedValue({
        name: "name",
        creatorId: "creator_id",
        uri: "uri",
        groupId: 1,
        queueId: 1,
        durationMs: 100,
        isPlayable: true
    });
    mockedConfig.prototype.get.mockReturnValue(
        Object.assign(configTemplate, {
            DEFAULT_VOLUME_DELTA: 10
        })
    );
});

afterEach(() => {
    jest.resetAllMocks();
});

describe("Controller.add()", () => {
    test("Should return a failiure if an invalid resource is given", async () => {
        mockedIdentifySpotifyResource.mockReturnValue(undefined);
        const controller = makeController();
        const result = await controller.add("creator_id", "resource");
        expect(result.success).toBe(false);
    });

    test("Should add the resource with the correct arguments", async () => {
        const controller = makeController();
        await controller.add("creator_id", "resource", 5);

        expect(mockedQueue.prototype.add).toBeCalled();
        expect(mockedQueue.prototype.add.mock.calls[0][0]).toEqual({
            type: "track",
            id: "track_id"
        });
        expect(mockedQueue.prototype.add.mock.calls[0][1]).toBe("creator_id");
        expect(mockedQueue.prototype.add.mock.calls[0][2]).toBe(5);
    });

    test("If adding a track is succesfull, should return a success", async () => {
        const controller = makeController();
        const result = await controller.add("creator_id", "resource");
        expect(result.success).toBe(true);
        expect(result.message.includes("creator_id")).toBe(true);
        expect(result.message.includes("track_name")).toBe(true);
    });

    test("If adding a playlist or album is succesfull, should return a success", async () => {
        mockedQueue.prototype.add.mockResolvedValue({
            name: "album_name",
            type: "album",
            creatorId: "creator_id",
            groupId: 1,
            tracks: 1
        });
        const controller = makeController();
        const result = await controller.add("creator_id", "resource");
        expect(result.success).toBe(true);
        expect(result.message.includes("creator_id")).toBe(true);
        expect(result.message.includes("album_name")).toBe(true);
    });

    test("If no tracks could be added, should return a failiure", async () => {
        mockedQueue.prototype.add.mockResolvedValue({
            name: "album_name",
            type: "album",
            creatorId: "creator_id",
            groupId: 1,
            tracks: 0
        });
        const controller = makeController();
        const result = await controller.add("creator_id", "resource");
        expect(result.success).toBe(false);
    });

    test("If adding is not succesfull, should return a failiure message", async () => {
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedQueue.prototype.add.mockRejectedValue(undefined);
        const controller = makeController();
        const result = await controller.add("creator_id", "resource");
        expect(result.success).toBe(false);
    });
});

describe("Controller.play()", () => {
    test("Should fail if the queue is already playing", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(true);
        mockedQueue.prototype.getQueue.mockReturnValue([
            {
                name: "name",
                uri: "uri",
                creatorId: "creator_id",
                queueId: 1,
                groupId: 1,
                durationMs: 100,
                isPlayable: true
            }
        ]);
        const result = await controller.play("");
        expect(result.success).toBe(false);
    });

    test("Should fail if called when the queue is empty and no track is paused", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getQueue.mockReturnValue([]);
        const result = await controller.play("");
        expect(result.success).toBe(false);
    });

    test("Should call nextTrack if required and return a message with the current playing track and user", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getQueue.mockReturnValue([
            {
                name: "track_name",
                uri: "uri",
                creatorId: "creator_id",
                queueId: 1,
                groupId: 1,
                durationMs: 100,
                isPlayable: true
            }
        ]);
        const result = await controller.play("John Doe");
        expect(mockedQueue.prototype.nextTrack).toBeCalled();
        expect(result.success).toBe(true);
        expect(result.message.includes("John Doe"));
        expect(result.message.includes("track_name"));
    });

    test("Should call resume if required and return a message with the current playing track", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "track_name",
            uri: "uri",
            creatorId: "creator_id",
            queueId: 1,
            groupId: 1,
            durationMs: 100,
            isPlayable: true
        });
        const result = await controller.play("");
        expect(mockedQueue.prototype.resume).toBeCalled();
        expect(result.success).toBe(true);
        expect(result.message.includes("track_name"));
    });

    test("Should fail queue was unable to play", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "track_name",
            uri: "uri",
            creatorId: "creator_id",
            queueId: 1,
            groupId: 1,
            durationMs: 100,
            isPlayable: true
        });
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedQueue.prototype.resume.mockRejectedValue(undefined);
        const result = await controller.play("");
        expect(result.success).toBe(false);
    });
});

describe("Controller.pause()", () => {
    test("Should stop spotify if the queue isn't playing", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        const result = await controller.pause("");
        expect(mockedQueue.prototype.stop).toBeCalled();
        expect(result.success).toBe(true);
    });

    test("If unable to stop spotify, should fail", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(false);
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedQueue.prototype.stop.mockRejectedValue(undefined);
        const result = await controller.pause("");
        expect(result.success).toBe(false);
    });

    test("Should pause the queue if the queue is playing", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(true);
        const result = await controller.pause("user_id");
        expect(mockedQueue.prototype.pause).toBeCalled();
        expect(result.success).toBe(true);
        expect(result.message.includes("user_id")).toBe(true);
    });

    test("If unable to pause the queue, should fail", async () => {
        const controller = makeController();
        mockedQueue.prototype.isPlaying.mockReturnValue(true);
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedQueue.prototype.pause.mockRejectedValue(undefined);
        const result = await controller.pause("");
        expect(result.success).toBe(false);
    });
});

describe("Controller.changeVolume()", () => {
    test("Should fail when trying to move volume out of bounds", async () => {
        const controller = makeController();

        (controller as any).queue.spotify.volume = 100;

        let result = await controller.changeVolume("", true);
        expect(result.success).toBe(false);
        expect(result.message.includes("max")).toBe(true);

        (controller as any).queue.spotify.volume = 0;
        result = await controller.changeVolume("", false);
        expect(result.success).toBe(false);
        expect(result.message.includes("min")).toBe(true);
    });

    test("Should set the volume and return success if successful", async () => {
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign(configTemplate, {
                DEFAULT_VOLUME_DELTA: 5
            })
        );

        const controller = makeController();
        (controller as any).queue.spotify.volume = 50;
        let result = await controller.changeVolume("", true);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(55);

        (controller as any).queue.spotify.volume = 50;
        result = await controller.changeVolume("", false);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(45);
    });

    test("Should accept an optional amount value", async () => {
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign(configTemplate, {
                DEFAULT_VOLUME_DELTA: 5
            })
        );

        const controller = makeController();
        (controller as any).queue.spotify.volume = 50;
        let result = await controller.changeVolume("", true, 20);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(70);

        (controller as any).queue.spotify.volume = 50;
        result = await controller.changeVolume("", false, 20);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(30);
    });

    test("Should constrain the optional amount value", async () => {
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign(configTemplate, {
                DEFAULT_VOLUME_DELTA: 5,
                MAX_VOLUME_DELTA: 10
            })
        );

        const controller = makeController();
        (controller as any).queue.spotify.volume = 50;
        let result = await controller.changeVolume("", true, 20);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(60);

        (controller as any).queue.spotify.volume = 50;
        result = await controller.changeVolume("", false, 20);
        expect(result.success).toBe(true);
        expect(mockedSpotify.prototype.setVolume).toBeCalledWith(40);
    });

    test("Should fail if not successful", async () => {
        const controller = makeController();
        jest.spyOn(console, "error").mockImplementation(() => {});
        mockedSpotify.prototype.setVolume.mockRejectedValue(undefined);
        const result = await controller.changeVolume("", true);
        expect(result.success).toBe(false);
    });
});
