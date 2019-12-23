import winston from "winston";

import { Config } from "./lib/Config";
import { CommandHandler } from "./lib/CommandHandler";
import { Controller } from "./lib/Controller";
import { Spotify } from "./lib/Spotify";
import { Queue } from "./lib/Queue";
import { DeviceSelector } from "./lib/DeviceSelector";
import { Votes } from "./lib/Votes";
import { NowPlaying } from "./lib/NowPlaying";
import { SearchHandler } from "./lib/SearchHandler";
import { Slack } from "./lib/Slack";
import { Bot } from "./lib/Bot";

const config = new Config();
const spotify = new Spotify(config);
const queue = new Queue(config, spotify);
const controller = new Controller(config, queue);
const searchHandler = new SearchHandler(config, spotify, queue);
const deviceSelector = new DeviceSelector(config, spotify);
const votes = new Votes(config, queue);
const nowPlaying = new NowPlaying(queue);
const commandHandler = new CommandHandler(controller, searchHandler, votes, deviceSelector, nowPlaying);
const slack = new Slack(config);
const bot = new Bot(config, slack, commandHandler);

async function start() {
    await spotify.authorize();
    await bot.listen();
    if (config.get().AUTO_SELECT_DEVICE) {
        await deviceSelector.autoSelectDevice();
    }
}

require("./lib/configureLogger");

winston.info("Starting app");
winston.info("Authenticating slack and spotify");
start()
    .then(() => {
        winston.info("Spotify and slack authenticated");
    })
    .catch((error) => {
        winston.error(error);
    });
