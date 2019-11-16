import fs from "fs";
import path from "path";

const configDirectory = path.join(__dirname, "..", "config.json");

const configTemplate = {
    SPOTIFY_CLIENT_ID: "",
    SPOTIFY_CLIENT_SECRET: "",
    SLACK_BOT_TOKEN: "",
    SKIP_THRESHOLD: 1,
    DEFAULT_TRACK_LIMIT: 100,
    AUTH_PORT: 8080,
    BROADCAST_CHANNEL: "",
    VOLUME_DELTA: 10,
    SEARCH_RESULTS_LIFETIME: 43200000,
    OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
    SPOTIFY_ACCESS_TOKEN: null,
    SPOTIFY_REFRESH_TOKEN: null
};

interface IConfig {
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
    SLACK_BOT_TOKEN: string;
    SKIP_THRESHOLD: number;
    DEFAULT_TRACK_LIMIT: number;
    AUTH_PORT: number;
    BROADCAST_CHANNEL: string | null;
    VOLUME_DELTA: number;
    SEARCH_RESULTS_LIFETIME: number;
    OPTION_EMOJIS: string[];
    SPOTIFY_ACCESS_TOKEN: string | null;
    SPOTIFY_REFRESH_TOKEN: string | null;
}

class Config {
    private data: IConfig;

    constructor() {
        if (fs.existsSync(configDirectory)) {
            this.data = JSON.parse(fs.readFileSync(configDirectory).toString());
        } else {
            this.data = configTemplate;
            fs.writeFileSync(configDirectory, JSON.stringify(configTemplate, null, 4));
        }
    }

    public get(): IConfig {
        return this.data;
    }

    public write(key: string, value: any): Promise<any> {
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

export default new Config();
