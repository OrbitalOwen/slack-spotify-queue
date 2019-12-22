import { mocked } from "ts-jest/utils";

import { Slack, ISlackMessage, ISlackReaction } from "./Slack";
import { CommandHandler } from "./CommandHandler";
import { Config, configTemplate } from "./Config";
import { Bot } from "./Bot";
import { AwaitSignal } from "./AwaitSignal";

jest.mock("./Slack");
jest.mock("./CommandHandler");
jest.mock("./Config");

const mockedSlack = mocked(Slack, true);
const mockedCommandHandler = mocked(CommandHandler, true);
const mockedConfig = mocked(Config, true);

beforeEach(() => {
    mockedConfig.prototype.get.mockReturnValue(
        Object.assign({}, configTemplate, {
            BROADCAST_CHANNEL: "broadcast_channel",
            OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "zero"]
        })
    );
    mockedSlack.prototype.sendMessage.mockResolvedValue({
        user: "bot_id",
        channel: "channel_id",
        text: "Bot response!",
        ts: "1"
    });
    mockedCommandHandler.prototype.processCommand.mockResolvedValue({
        success: true,
        type: "dm"
    });
});

afterEach(() => {
    jest.resetAllMocks();
});

function getMessageSignal() {
    const messageSignal = new AwaitSignal<[ISlackMessage]>();
    mockedSlack.prototype.onMessage.mockImplementation((callback: (message: ISlackMessage) => Promise<void>) => {
        return messageSignal.connect(callback);
    });
    return messageSignal;
}

function getReactionSignal() {
    const reactionSignal = new AwaitSignal<[ISlackReaction]>();

    mockedSlack.prototype.onReactionTo.mockImplementation(
        (message: ISlackMessage, callback: (reaction: ISlackReaction) => Promise<void>) => {
            return reactionSignal.connect(callback);
        }
    );

    return reactionSignal;
}

async function makeBotAndListen() {
    const config = new Config();
    // @ts-ignore - This module is mocked so we don't care about its dependencies
    const slack = new Slack();
    // @ts-ignore - This module is mocked so we don't care about its dependencies
    const commandHandler = new CommandHandler();
    await new Bot(config, slack, commandHandler).listen();
}

describe("listen()", () => {
    test("The slack RTM client should be connected", async () => {
        await makeBotAndListen();
        expect(mockedSlack.prototype.connect).toHaveBeenCalled();
    });

    test("Should listen for slack messages", async () => {
        await makeBotAndListen();
        expect(mockedSlack.prototype.onMessage).toHaveBeenCalled();
    });

    test("Should process commands from incoming messages", async () => {
        const signal = getMessageSignal();
        await makeBotAndListen();

        await signal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(mockedCommandHandler.prototype.processCommand).toHaveBeenCalledWith("user_id", "Hello, world!");
    });

    test("Should send a successful response if required", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "Outgoing message",
            type: "dm"
        });

        const signal = getMessageSignal();
        await makeBotAndListen();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await signal.fire(message);

        expect(mockedSlack.prototype.reactTo).toBeCalledWith(message, "heavy_check_mark");
        expect(mockedSlack.prototype.sendMessage).toBeCalledWith("channel_id", "Outgoing message");
    });

    test("Should send a failed response if required", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: false,
            message: "Outgoing message",
            type: "dm"
        });

        const signal = getMessageSignal();
        await makeBotAndListen();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await signal.fire(message);

        expect(mockedSlack.prototype.reactTo).toBeCalledWith(message, "x");
        expect(mockedSlack.prototype.sendMessage).toBeCalledWith("channel_id", "Outgoing message");
    });

    test("Should send no message if none is given", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            type: "dm"
        });

        const signal = getMessageSignal();
        await makeBotAndListen();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await signal.fire(message);

        expect(mockedSlack.prototype.reactTo).toBeCalledWith(message, "heavy_check_mark");
        expect(mockedSlack.prototype.sendMessage).not.toHaveBeenCalled();
    });

    test("Should listen to reactions if a callback is given", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm",
            callback: jest.fn()
        });

        const messageSignal = getMessageSignal();

        await makeBotAndListen();

        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(mockedSlack.prototype.onReactionTo.mock.calls[0][0]).toMatchObject({
            user: "bot_id",
            channel: "channel_id",
            text: "Bot response!",
            ts: "1"
        });
    });

    test("Should pass reactions through correctly to the callback", async () => {
        const callback = jest.fn().mockResolvedValue({
            success: true
        });

        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm",
            callback
        });

        const messageSignal = getMessageSignal();
        const reactionSignal = getReactionSignal();

        await makeBotAndListen();

        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        await reactionSignal.fire({
            user: "user_id",
            reaction: "party",
            item: {
                type: "message",
                ts: "0"
            }
        });

        expect(callback).not.toHaveBeenCalled();

        await reactionSignal.fire({
            user: "user_id",
            reaction: "three",
            item: {
                type: "message",
                ts: "0"
            }
        });

        expect(callback).toHaveBeenLastCalledWith(2, "user_id");
    });

    test("Should stop listening to reactions if the callback return a success", async () => {
        const callback = jest.fn().mockResolvedValue({
            success: false
        });

        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm",
            callback
        });

        const messageSignal = getMessageSignal();
        const reactionSignal = getReactionSignal();

        await makeBotAndListen();

        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        // Failure returned
        await reactionSignal.fire({
            user: "user_id",
            reaction: "one",
            item: {
                type: "message",
                ts: "0"
            }
        });
        expect(callback).toHaveBeenCalled();

        callback.mockClear();
        callback.mockReturnValue({
            success: true
        });

        // Success returned
        await reactionSignal.fire({
            user: "user_id",
            reaction: "one",
            item: {
                type: "message",
                ts: "0"
            }
        });
        expect(callback).toHaveBeenCalled();

        // Should have disconnected by now
        callback.mockClear();
        await reactionSignal.fire({
            user: "user_id",
            reaction: "one",
            item: {
                type: "message",
                ts: "0"
            }
        });
        expect(callback).not.toHaveBeenCalled();
    });

    test("Should process the response returned by the option callback", async () => {
        const callback = jest.fn().mockResolvedValue({
            success: true,
            message: "This is my response",
            type: "dm"
        });

        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm",
            callback
        });

        const messageSignal = getMessageSignal();
        const reactionSignal = getReactionSignal();

        await makeBotAndListen();

        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        await reactionSignal.fire({
            user: "user_id",
            reaction: "one",
            item: {
                type: "message",
                ts: "0"
            }
        });

        expect(mockedSlack.prototype.sendMessage).toHaveBeenCalledWith("channel_id", "This is my response");
    });

    test("Should stop listening for option responses after a while", async () => {
        jest.useFakeTimers();

        const callback = jest.fn().mockResolvedValue({
            success: true,
            message: "This is my response",
            type: "dm"
        });

        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm",
            callback
        });

        const messageSignal = getMessageSignal();
        const reactionSignal = getReactionSignal();

        await makeBotAndListen();

        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        jest.advanceTimersByTime(600001);

        await reactionSignal.fire({
            user: "user_id",
            reaction: "one",
            item: {
                type: "message",
                ts: "0"
            }
        });

        expect(callback).not.toHaveBeenCalled();
    });

    test("Should broadcast response correctly", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "broadcast"
        });

        const messageSignal = getMessageSignal();
        await makeBotAndListen();
        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(mockedSlack.prototype.sendMessage).toHaveBeenCalled();
        expect(mockedSlack.prototype.sendMessage.mock.calls[0][0]).toBe("broadcast_channel");
    });

    test("Should DM response if there is no broadcast channel", async () => {
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "broadcast"
        });
        mockedConfig.prototype.get.mockReturnValue(
            Object.assign({}, configTemplate, {
                BROADCAST_CHANNEL: null
            })
        );

        const messageSignal = getMessageSignal();
        await makeBotAndListen();
        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(mockedSlack.prototype.sendMessage).toHaveBeenCalled();
        expect(mockedSlack.prototype.sendMessage.mock.calls[0][0]).toBe("channel_id");
    });

    test("Should log an error if sending a message fails", async () => {
        const errorMock = jest.spyOn(console, "error").mockImplementation(() => {});

        mockedSlack.prototype.sendMessage.mockRejectedValue(undefined);
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm"
        });

        const messageSignal = getMessageSignal();
        await makeBotAndListen();
        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(errorMock).toHaveBeenCalled();
    });

    test("Should log an error if reacting fails", async () => {
        const errorMock = jest.spyOn(console, "error").mockImplementation(() => {});

        mockedSlack.prototype.reactTo.mockRejectedValue(undefined);
        mockedCommandHandler.prototype.processCommand.mockResolvedValue({
            success: true,
            message: "These are your options",
            type: "dm"
        });

        const messageSignal = getMessageSignal();
        await makeBotAndListen();
        await messageSignal.fire({
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        });

        expect(errorMock).toHaveBeenCalled();
    });
});
