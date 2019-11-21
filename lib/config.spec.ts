import fs from "fs";
import path from "path";
import { mocked } from "ts-jest/utils";
import Config from "./Config";

jest.mock("fs");
const mockedFs = mocked(fs, false);

const configDirectory = path.join(__dirname, "..", "config.json");

function mockWriteFileCallback(error?: Error) {
    mockedFs.writeFile.mockImplementation((path, data, callback) => {
        callback(error);
    });
}

beforeEach(() => {
    mockWriteFileCallback();
});

afterEach(() => {
    jest.resetAllMocks();
});

test("Should create a config file and use the template if non exists", () => {
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.writeFileSync.mockImplementation(jest.fn);

    const config = new Config();

    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(configDirectory, expect.any(String));
    expect(config.get().AUTH_PORT).toBe(8080);
});

describe("Config.read()", () => {
    test("Should read the config file if it exists", () => {
        const templateConfig = {
            testValue: 1
        };
        const testConfigBuffer = Buffer.from(JSON.stringify(templateConfig), "utf8");
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockImplementation(() => testConfigBuffer);

        const config = new Config();

        expect(mockedFs.readFileSync).toHaveBeenCalledWith(configDirectory);
        expect(config.get()).toEqual(templateConfig);
    });
});

describe("Config.write()", () => {
    test("Should update the cached value when written to", async () => {
        mockedFs.writeFileSync.mockImplementation(jest.fn);

        const config = new Config();

        await config.write("BROADCAST_CHANNEL", "MY_CHANNEL");
        expect(config.get().BROADCAST_CHANNEL).toBe("MY_CHANNEL");
    });

    test("Should update the config file when written to", async () => {
        const templateConfig = {};
        const testConfigBuffer = Buffer.from(JSON.stringify(templateConfig), "utf8");
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockImplementation(() => testConfigBuffer);

        const config = new Config();

        await config.write("testValue", 3);

        expect(mockedFs.writeFile).toHaveBeenCalledWith(configDirectory, expect.any(String), expect.any(Function));
        expect(JSON.parse(mockedFs.writeFile.mock.calls[0][1])).toEqual({ testValue: 3 });
    });

    test("Should return a promise that resolves when the file is written successfully", async () => {
        const templateConfig = {};
        const testConfigBuffer = Buffer.from(JSON.stringify(templateConfig), "utf8");
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockImplementation(() => testConfigBuffer);

        const config = new Config();

        await expect(config.write("testValue", 3)).resolves.toBe(undefined);
    });

    test("Should return a promise that rejects when the file is written unsuccessfully", async () => {
        const templateConfig = {};
        const testConfigBuffer = Buffer.from(JSON.stringify(templateConfig), "utf8");
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockImplementation(() => testConfigBuffer);
        mockWriteFileCallback(new Error());

        const config = new Config();

        await expect(config.write("testValue", 3)).rejects.toEqual(expect.any(Error));
    });
});
