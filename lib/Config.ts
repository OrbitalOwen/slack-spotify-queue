// Stores config data
import winston from "winston";
import fs from "fs";
import path from "path";

const configDirectory = path.join(__dirname, "..", "config.json");

export interface IConfig {
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
    SLACK_BOT_TOKEN: string;
    SKIP_THRESHOLD: number;
    DEFAULT_TRACK_LIMIT: number;
    AUTH_PORT: number;
    BROADCAST_CHANNEL: string | null;
    DEFAULT_VOLUME_DELTA: number;
    MAX_VOLUME_DELTA: number;
    OPTION_EMOJIS: string[];
    SPOTIFY_ACCESS_TOKEN: string | null;
    SPOTIFY_REFRESH_TOKEN: string | null;
    SEARCH_LIMIT: number;
    AUTO_SELECT_DEVICE: boolean;
}

export const configTemplate: IConfig = {
    SPOTIFY_CLIENT_ID: "",
    SPOTIFY_CLIENT_SECRET: "",
    SLACK_BOT_TOKEN: "",
    SKIP_THRESHOLD: 1,
    DEFAULT_TRACK_LIMIT: 100,
    AUTH_PORT: 8080,
    BROADCAST_CHANNEL: "",
    DEFAULT_VOLUME_DELTA: 10,
    MAX_VOLUME_DELTA: 20,
    OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "zero"],
    SPOTIFY_ACCESS_TOKEN: null,
    SPOTIFY_REFRESH_TOKEN: null,
    SEARCH_LIMIT: 3,
    AUTO_SELECT_DEVICE: true
};

export class Config {
    private data: IConfig;

    constructor() {
        if (fs.existsSync(configDirectory)) {
            this.data = JSON.parse(fs.readFileSync(configDirectory).toString());
        } else {
            winston.info("No config file exists, creating a template config.json file");
            this.data = configTemplate;
            fs.writeFileSync(configDirectory, JSON.stringify(configTemplate, null, 4));
        }
    }

    public get(): IConfig {
        return this.data;
    }

    public write(key: string, value: any): Promise<void> {
        const config = this;
        return new Promise(function(resolve, reject) {
            config.data[key] = value;
            fs.writeFile(configDirectory, JSON.stringify(config.data, null, 4), function(error) {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }
}
