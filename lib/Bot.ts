// Handles incoming and outgoing slack messages and reactions

import { Slack, ISlackMessage } from "./Slack";
import { CommandHandler } from "./CommandHandler";
import { Config } from "./Config";
import { ICommandResponse } from "./CommandTypes";

export class Bot {
    private slack: Slack;
    private commandHandler: CommandHandler;
    private config: Config;

    constructor(config: Config, slack: Slack, commandHandler: CommandHandler) {
        this.slack = slack;
        this.commandHandler = commandHandler;
        this.config = config;
    }

    public async listen() {
        await this.slack.connect();

        const bot = this;
        this.slack.onMessage(async (message) => {
            const response = await bot.commandHandler.processCommand(message.user, message.text);
            await bot.processResponse(message.channel, response);
            await bot.sendStatus(message, response);
        });
    }

    private async sendStatus(message: ISlackMessage, response: ICommandResponse) {
        try {
            await this.slack.reactTo(message, response.success ? "heavy_check_mark" : "x");
        } catch (error) {
            console.error(`Error reacting to message ${error}`);
        }
    }

    private listenToOptions(response: ICommandResponse, message: ISlackMessage) {
        const emojiIndexes = this.config.get().OPTION_EMOJIS;
        const bot = this;
        const connection = this.slack.onReactionTo(message, async (reaction) => {
            const index = emojiIndexes.indexOf(reaction.reaction);
            if (index !== -1) {
                const optionResponse = await response.callback(index, reaction.user);
                if (optionResponse.success) {
                    connection.disconnect();
                }
                await bot.processResponse(message.channel, optionResponse);
            }
        });
        // Stop listening for reactions after an hour
        setTimeout(() => {
            connection.disconnect();
        }, 600000);
    }

    private async processResponse(channel: string, response: ICommandResponse) {
        if (response.message) {
            const broadcastChannel = this.config.get().BROADCAST_CHANNEL;
            const sendChannel = response.type === "dm" ? channel : broadcastChannel ? broadcastChannel : undefined;
            if (sendChannel) {
                try {
                    const message = await this.slack.sendMessage(sendChannel, response.message);
                    if (response.callback) {
                        this.listenToOptions(response, message);
                    }
                } catch (error) {
                    console.error(`Error sending message ${error}`);
                }
            }
        }
    }
}
