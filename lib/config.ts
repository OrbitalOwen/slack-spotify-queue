import fs from "fs";
import path from "path";

const configDirectory = path.join(__dirname, "..", "config.json");

interface IConfig {
    SPOTIFY_CLIENT_ID: string;
    SPOTIFY_CLIENT_SECRET: string;
    SLACK_BOT_TOKEN: string;
    SKIP_THRESHOLD: number;
    AUTH_PORT: number;
    DEFAULT_TRACK_LIMIT: number;
    SPOTIFY_ACCESS_TOKEN?: string;
    SPOTIFY_REFRESH_TOKEN?: string;
}

class Config {
    private data: IConfig;

    constructor() {
        if (!fs.existsSync(configDirectory)) {
            console.error("config.json does not exist in root directory. See Readme.md for instructions.");
            process.exit(1);
        }
        this.data = JSON.parse(fs.readFileSync(configDirectory).toString());
    }

    public get(key: string): any {
        if (this.data.hasOwnProperty(key)) {
            return this.data[key];
        }
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
