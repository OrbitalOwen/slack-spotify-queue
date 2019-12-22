import { DeviceSelector } from "./DeviceSelector";
import { Spotify } from "./Spotify";
import { Config, configTemplate } from "./Config";
import { mocked } from "ts-jest/utils";

jest.mock("./Spotify");
jest.mock("./Config");

const mockedSpotify = mocked(Spotify, true);
const mockedConfig = mocked(Config, true);

beforeEach(() => {
    mockedConfig.prototype.get.mockReturnValue(
        Object.assign(configTemplate, {
            OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "zero"]
        })
    );
    mockedSpotify.prototype.getAvailableDevices.mockResolvedValue([
        { name: "device1", id: "id1" },
        { name: "device2", id: "id2" },
        { name: "device3", id: "id3" }
    ]);
});

afterEach(() => {
    jest.resetAllMocks();
});

function makeSelector() {
    const config = new Config();
    const spotify = new Spotify(config);
    const selector = new DeviceSelector(config, spotify);
    return selector;
}

describe("deviceSelector.promptSelection()", () => {
    test("If spotify could not get available devices, should fail", async () => {
        mockedSpotify.prototype.getAvailableDevices.mockRejectedValue(undefined);

        const selector = makeSelector();
        const result = await selector.promptSelection();

        expect(result.success).toBe(false);
    });

    test("Should generate a correct message with the available devices", async () => {
        const selector = makeSelector();
        const result = await selector.promptSelection();

        expect(result.success).toBe(true);
        expect(result.message).toBe(`Available devices:
:one: device1
:two: device2
:three: device3
React to select device`);
    });

    test("Should work when too many devices are available", async () => {
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign(configTemplate, {
                OPTION_EMOJIS: ["one"]
            })
        );

        const selector = makeSelector();
        const result = await selector.promptSelection();

        expect(result.success).toBe(true);
        expect(result.message).toBe(`Available devices:
:one: device1
React to select device`);
    });

    test("Should return a callback that fails if an invalid response is given", async () => {
        const selector = makeSelector();
        const result = await selector.promptSelection();
        expect(result.success).toBe(true);

        await expect(result.callback(99, "creator")).resolves.toMatchObject({
            success: false
        });
    });

    test("Should return a callback that sets the device correctly", async () => {
        const selector = makeSelector();
        const result = await selector.promptSelection();
        const actionResponse = await result.callback(2, "creator");

        expect(actionResponse.success).toBe(true);
        expect(actionResponse.message.includes("creator")).toBe(true);
        expect(mockedSpotify.prototype.setDeviceId).toHaveBeenCalledWith("id3");
    });

    test("Should return a callback that fails if setting the device errors", async () => {
        mockedSpotify.prototype.setDeviceId.mockRejectedValue(undefined);

        const selector = makeSelector();
        const result = await selector.promptSelection();
        const actionResponse = await result.callback(2, "creator");

        expect(actionResponse.success).toBe(false);
    });
});
