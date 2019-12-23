import { Controller } from "./Controller";
import { SearchHandler } from "./SearchHandler";
import { Votes } from "./Votes";
import { DeviceSelector } from "./DeviceSelector";
import { Spotify } from "./Spotify";
import { Queue } from "./Queue";
import { Config, configTemplate } from "./Config";
import { NowPlaying } from "./NowPlaying";
import { mocked } from "ts-jest/utils";
import { CommandHandler } from "./CommandHandler";

jest.mock("./Config");
jest.mock("./Spotify");
jest.mock("./Queue");
jest.mock("./Controller");
jest.mock("./SearchHandler");
jest.mock("./Votes");
jest.mock("./DeviceSelector");
jest.mock("./NowPlaying");

const mockedController = mocked(Controller, true);
const mockedSearchHandler = mocked(SearchHandler, true);
const mockedVotes = mocked(Votes, true);
const mockedDeviceSelector = mocked(DeviceSelector, true);
const mockedNowPlaying = mocked(NowPlaying, true);

beforeEach(() => {});

afterEach(() => {
    jest.resetAllMocks();
});

function makeHandler() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    const controller = new Controller(config, queue);
    const searchHandler = new SearchHandler(config, spotify, queue);
    const votes = new Votes(config, queue);
    const deviceSelector = new DeviceSelector(config, spotify);
    const nowPlaying = new NowPlaying(queue);
    const commandHandler = new CommandHandler(controller, searchHandler, votes, deviceSelector, nowPlaying);
    return commandHandler;
}

describe("processCommand", () => {
    test("Should fail if an invalid command is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "hotdog");
        expect(result.success).toBe(false);
    });
});

describe("add", () => {
    test("Should fail if no resource is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "add");
        expect(result.success).toBe(false);
    });

    test("Should fail if an invalid limit is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "add spotify:track:id pizza");
        expect(result.success).toBe(false);
    });

    test("Should add the resource correctly and return success if successful", async () => {
        mockedController.prototype.add.mockResolvedValue({
            success: true,
            message: "message"
        });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "add spotify:track:id 5");

        expect(mockedController.prototype.add).toBeCalledWith("userId", "spotify:track:id", 5);
        expect(result.success).toBe(true);
    });

    test("Should add the resource and return fail if failed", async () => {
        mockedController.prototype.add.mockResolvedValue({ success: false });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "add spotify:track:id 5");

        expect(result.success).toBe(false);
    });
});

describe("play", () => {
    test("Should succeed if playing succeeded", async () => {
        mockedController.prototype.play.mockResolvedValue({ success: true });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "play");

        expect(mockedController.prototype.play).toHaveBeenCalledWith("userId", false);
        expect(result.success).toBe(true);
    });

    test("Should pass through the force parameter", async () => {
        mockedController.prototype.play.mockResolvedValue({ success: true });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "play force");

        expect(mockedController.prototype.play).toHaveBeenCalledWith("userId", true);
        expect(result.success).toBe(true);
    });

    test("Should fail if playing failed", async () => {
        mockedController.prototype.play.mockResolvedValue({ success: false });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "play");

        expect(result.success).toBe(false);
    });
});

describe("pause", () => {
    test("Should succeed if pausing succeeded", async () => {
        mockedController.prototype.pause.mockResolvedValue({ success: true });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "pause");

        expect(mockedController.prototype.pause).toHaveBeenCalledWith("userId");
        expect(result.success).toBe(true);
    });

    test("Should fail if pausing failed", async () => {
        mockedController.prototype.pause.mockResolvedValue({ success: false });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "pause");

        expect(result.success).toBe(false);
    });
});

describe("volume", () => {
    test("Should fail if an invalid direction is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "volume pizza");

        expect(result.success).toBe(false);
    });

    test("Should fail if an invalid amount is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "volume up pizza");

        expect(result.success).toBe(false);
    });

    test("Should change the volume correctly", async () => {
        mockedController.prototype.changeVolume.mockResolvedValue({ success: true });

        const handler = makeHandler();

        let result = await handler.processCommand("userId", "volume up 5%");
        expect(mockedController.prototype.changeVolume).toHaveBeenLastCalledWith("userId", true, 5);
        expect(result.success).toBe(true);

        result = await handler.processCommand("userId", "volume down 10");
        expect(mockedController.prototype.changeVolume).toHaveBeenLastCalledWith("userId", false, 10);
        expect(result.success).toBe(true);
    });

    test("Should fail if changing failed", async () => {
        mockedController.prototype.changeVolume.mockResolvedValue({ success: false });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "volume up 5%");

        expect(result.success).toBe(false);
    });
});

describe("skip", () => {
    test("Should fail if an invalid parameter is given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "skip pizza");

        expect(result.success).toBe(false);
    });

    test("Should skip correctly, and succeed if successful", async () => {
        mockedVotes.prototype.skipCurrent.mockResolvedValue({ success: true });

        const handler = makeHandler();
        let result = await handler.processCommand("userId", "skip");
        expect(mockedVotes.prototype.skipCurrent).toHaveBeenLastCalledWith("userId", false);
        expect(result.success).toBe(true);

        result = await handler.processCommand("userId", "skip group");
        expect(mockedVotes.prototype.skipCurrent).toHaveBeenLastCalledWith("userId", true);
        expect(result.success).toBe(true);
    });

    test("Should fail if failed", async () => {
        mockedVotes.prototype.skipCurrent.mockResolvedValue({ success: false });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "skip");
        expect(result.success).toBe(false);
    });
});

describe("status", () => {
    test("Should return the status", async () => {
        mockedNowPlaying.prototype.get.mockReturnValue("status_message");
        const handler = makeHandler();

        const result = await handler.processCommand("userId", "status");
        expect(result.success).toBe(true);
        expect(result.message).toBe("status_message");
    });
});

describe("devices", () => {
    test("Should return correctly if successful", async () => {
        const fn = jest.fn();
        mockedDeviceSelector.prototype.promptSelection.mockResolvedValue({
            success: true,
            message: "devices_message",
            callback: fn
        });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "devices");

        expect(result.success).toBe(true);
        expect(result.message).toBe("devices_message");
        expect(result.callback).toBe(fn);
    });

    test("Should fail if not successful", async () => {
        mockedDeviceSelector.prototype.promptSelection.mockResolvedValue({
            success: false
        });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "devices");

        expect(result.success).toBe(false);
    });
});

describe("search", () => {
    test("Should fail if no query given", async () => {
        const handler = makeHandler();
        const result = await handler.processCommand("userId", "search");

        expect(result.success).toBe(false);
    });

    test("Should return correctly if successful", async () => {
        const fn = jest.fn();
        mockedSearchHandler.prototype.search.mockResolvedValue({
            success: true,
            message: "search_message",
            callback: fn
        });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "search song");

        expect(result.success).toBe(true);
        expect(result.message).toBe("search_message");
        expect(result.callback).toBe(fn);
    });

    test("Should fail if not successful", async () => {
        mockedSearchHandler.prototype.search.mockResolvedValue({
            success: false
        });

        const handler = makeHandler();
        const result = await handler.processCommand("userId", "search song");

        expect(result.success).toBe(false);
    });
});
