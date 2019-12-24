// Wraps the Slack RTM API, providing methods for listening and sending DMs and reactions

import { RTMClient } from "@slack/rtm-api";
import { WebClient } from "@slack/web-api";
import { AwaitSignal, IAwaitSignalConnection } from "./AwaitSignal";
import { Config } from "./Config";

export interface ISlackMessage {
    user: string;
    channel: string;
    text: string;
    ts: string;
}

export interface ISlackReaction {
    user: string;
    reaction: string;
    item: {
        type: string;
        ts: string;
    };
}

export class Slack {
    private rtmClient: RTMClient;
    private webClient: WebClient;
    private messageSignal: AwaitSignal<[ISlackMessage]>;
    private reactionSignal: AwaitSignal<[ISlackReaction]>;

    constructor(config: Config) {
        const token = config.get().SLACK_BOT_TOKEN;
        this.rtmClient = new RTMClient(token);
        this.webClient = new WebClient(token);
        this.setupSignals();
    }

    private setupSignals() {
        const messageSignal = new AwaitSignal<[ISlackMessage]>();
        const reactionSignal = new AwaitSignal<[ISlackReaction]>();

        this.rtmClient.on("message", async (message: ISlackMessage) => {
            if (message.channel.startsWith("D")) {
                await messageSignal.fire(message);
            }
        });

        this.rtmClient.on("reaction_added", async (reaction: ISlackReaction) => {
            await reactionSignal.fire(reaction);
        });

        this.messageSignal = messageSignal;
        this.reactionSignal = reactionSignal;
    }

    public onMessage(callback: (message: ISlackMessage) => Promise<void>): IAwaitSignalConnection {
        return this.messageSignal.connect(callback);
    }

    public onReactionTo(
        message: ISlackMessage,
        callback: (reaction: ISlackReaction) => Promise<void>
    ): IAwaitSignalConnection {
        return this.reactionSignal.connect(async (reaction: ISlackReaction) => {
            const messageTs = reaction.item ? reaction.item.ts : undefined;
            if (messageTs === message.ts) {
                await callback(reaction);
            }
        });
    }

    public async sendMessage(channel: string, messageBody: string): Promise<ISlackMessage> {
        const response = await this.rtmClient.addOutgoingEvent(true, "message", {
            text: messageBody,
            channel
        });
        if (response.error) {
            throw new Error(`Failed to send message - ${response.error.code} - ${response.error.msg}`);
        }
        return {
            user: this.rtmClient.activeUserId,
            channel,
            text: messageBody,
            ts: response.ts
        };
    }

    public async reactTo(message: ISlackMessage, reaction: string): Promise<void> {
        const response = await this.webClient.reactions.add({
            channel: message.channel,
            name: reaction,
            timestamp: message.ts
        });

        if (!response.ok) {
            throw new Error(`Failed to react - ${response.error}`);
        }
    }

    public async connect() {
        await this.rtmClient.start();
    }
}
