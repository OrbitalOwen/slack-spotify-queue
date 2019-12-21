import { RTMClient } from "@slack/rtm-api";
import { WebClient } from "@slack/web-api";
import { mocked } from "ts-jest/utils";

import { AwaitSignal, IAwaitSignalConnection } from "./AwaitSignal";
import { Config, configTemplate } from "./Config";
import { Slack, ISlackMessage, ISlackReaction } from "./Slack";

jest.mock("@slack/rtm-api");
jest.mock("@slack/web-api");
jest.mock("./Config");

const mockedConfig = mocked(Config, true);
const mockedRtmClient = mocked(RTMClient, true);
const mockedWebClient = mocked(WebClient, true);

beforeEach(() => {
    mockedConfig.prototype.get.mockReturnValue(
        Object.assign({}, configTemplate, {
            SLACK_BOT_TOKEN: "valid_slack_bot_token"
        })
    );
    // @ts-ignore addOutgoingEvent returning a promise based on its arguments confuses TS
    mockedRtmClient.prototype.addOutgoingEvent.mockResolvedValue({ ts: "0" });
    // @ts-ignore jest doesn't mock the functions in this sub-object, so we'll make it ourselves
    mockedWebClient.prototype.reactions = { add: jest.fn() };
    mockedWebClient.prototype.reactions.add.mockResolvedValue({ ok: true });
});

afterEach(() => {
    jest.resetAllMocks();
});

function makeSlack() {
    const config = new Config();
    return new Slack(config);
}

function getEventSignals() {
    const messageEmitter = new AwaitSignal<[ISlackMessage]>();
    const reactionEmitter = new AwaitSignal<[ISlackReaction]>();

    const connectionStatus: { [key: string]: boolean } = {};

    mockedRtmClient.prototype.on.mockImplementation((type: string, callback: any): any => {
        connectionStatus[type] = true;
        if (type === "message") {
            messageEmitter.connect(callback);
        } else if (type === "reaction_added") {
            reactionEmitter.connect(callback);
        }
    });

    return { messageEmitter, reactionEmitter, connectionStatus };
}

describe("constructor()", () => {
    test("Should create a new rtm client with the bot token but not start it", () => {
        makeSlack();

        expect(mockedRtmClient).toBeCalledWith("valid_slack_bot_token");
        expect(mockedRtmClient.prototype.start).not.toHaveBeenCalled();
    });

    test("Should create a new web client with the bot token", () => {
        makeSlack();

        expect(mockedWebClient).toBeCalledWith("valid_slack_bot_token");
    });

    test("Should listen to the message and reaction_added events", () => {
        const { connectionStatus } = getEventSignals();
        const slack = makeSlack();
        expect(connectionStatus.message).toBe(true);
        expect(connectionStatus.reaction_added).toBe(true);
    });
});

describe("connect()", () => {
    test("Should start the RTM client", async () => {
        const slack = makeSlack();

        await slack.connect();
        expect(mockedRtmClient.prototype.start).toHaveBeenCalled();
    });
});

describe("onMessage()", () => {
    test("Should call the callback with the message when a message is sent", async () => {
        const { messageEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();
        slack.onMessage(callback);

        const message = {
            user: "user_id",
            channel: "D_channel_id",
            text: "Hello, world!",
            ts: "0"
        };
        await messageEmitter.fire(message);

        expect(callback).toHaveBeenCalledWith(message);
    });

    test("Should not call the callback if the message isn't a DM", async () => {
        const { messageEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();
        slack.onMessage(callback);

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };
        await messageEmitter.fire(message);

        expect(callback).not.toHaveBeenCalled();
    });

    test("Should return a connection that can be used to unsubscribe", async () => {
        const { messageEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();
        const connection = slack.onMessage(callback);
        connection.disconnect();

        const message = {
            user: "user_id",
            channel: "D_channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await messageEmitter.fire(message);

        expect(callback).not.toHaveBeenCalled();
    });
});

describe("onReactionTo()", () => {
    test("Should call the callback with the message when a reaction to the message is made", async () => {
        const { reactionEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        slack.onReactionTo(message, callback);

        const reaction = {
            user: "user_id",
            reaction: "string",
            item: {
                type: "message",
                ts: "0"
            }
        };
        await reactionEmitter.fire(reaction);

        expect(callback).toHaveBeenCalledWith(reaction);
    });

    test("Should not call the callback if the reaction is to a different message", async () => {
        const { reactionEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        slack.onReactionTo(message, callback);

        const reaction = {
            user: "user_id",
            reaction: "string",
            item: {
                type: "message",
                ts: "1"
            }
        };
        await reactionEmitter.fire(reaction);

        expect(callback).not.toHaveBeenCalled();
    });

    test("Should return a connection that can be used to unsubscribe from messages", async () => {
        const { reactionEmitter } = getEventSignals();

        const slack = makeSlack();

        const callback = jest.fn();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        const connection = slack.onReactionTo(message, callback);
        connection.disconnect();

        const reaction = {
            user: "user_id",
            reaction: "string",
            item: {
                type: "message",
                ts: "0"
            }
        };
        await reactionEmitter.fire(reaction);

        expect(callback).not.toHaveBeenCalled();
    });
});

describe("sendMessage()", () => {
    test("Should send a message correctly", async () => {
        const slack = makeSlack();

        await slack.sendMessage("channel_id", "Hello, world!");

        expect(mockedRtmClient.prototype.addOutgoingEvent).toHaveBeenCalled();
        expect(mockedRtmClient.prototype.addOutgoingEvent.mock.calls[0][0]).toBe(true);
        expect(mockedRtmClient.prototype.addOutgoingEvent.mock.calls[0][1]).toBe("message");
        expect(mockedRtmClient.prototype.addOutgoingEvent.mock.calls[0][2]).toEqual({
            text: "Hello, world!",
            channel: "channel_id"
        });
    });

    test("Should throw an error if sending the message fails", async () => {
        // @ts-ignore addOutgoingEvent returning a promise based on its arguments confuses ts
        mockedRtmClient.prototype.addOutgoingEvent.mockResolvedValue({ error: { code: "404", msg: "Oops" } });

        const slack = makeSlack();

        await expect(slack.sendMessage("channel_id", "Hello, world!")).rejects.toEqual(expect.any(Error));
    });

    test("Should return a message object for the sent message", async () => {
        const slack = makeSlack();

        const message = await slack.sendMessage("channel_id", "Hello, world!");

        expect(message.channel).toEqual(expect.any(String));
        expect(message.channel).toBe("channel_id");
        expect(message.text).toEqual("Hello, world!");
        expect(message.ts).toEqual("0");
    });
});

describe("reactTo()", () => {
    test("Should react correctly", async () => {
        const slack = makeSlack();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await slack.reactTo(message, "+1");

        expect(mockedWebClient.prototype.reactions.add).toHaveBeenCalled();
        expect(mockedWebClient.prototype.reactions.add.mock.calls[0][0]).toEqual({
            channel: "channel_id",
            name: "+1",
            timestamp: "0"
        });
    });

    test("Should throw an error if reacting the message fails", async () => {
        // @ts-ignore addOutgoingEvent returning a promise based on its arguments confuses ts
        mockedWebClient.prototype.reactions.add.mockResolvedValue({ ok: false, error: "Oops" });

        const slack = makeSlack();

        const message = {
            user: "user_id",
            channel: "channel_id",
            text: "Hello, world!",
            ts: "0"
        };

        await expect(slack.reactTo(message, "+1")).rejects.toEqual(expect.any(Error));
    });
});
