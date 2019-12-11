// A safe interface for device selection

import { Spotify, IDevice } from "./Spotify";
import { Config } from "./Config";
import { IActionResult } from "./Controller";

export interface IActionOption extends IActionResult {
    callback?: (index: number, creatorId: string) => Promise<IActionResult>;
}

export class DeviceSelector {
    private spotify: Spotify;
    private optionEmojis: string[];

    constructor(config: Config, spotify: Spotify) {
        this.optionEmojis = config.get().OPTION_EMOJIS;
        this.spotify = spotify;
    }

    private getOutputString(devices: IDevice[]): string {
        let outputString = "Available devices:";
        for (const [index, device] of Object.entries(devices)) {
            outputString += `\n:${this.optionEmojis[index]}: ${device.name}`;
        }
        outputString += "\nReact to select device";
        return outputString;
    }

    private getOptionCallback(devices: IDevice[]): (index: number, creatorId: string) => Promise<IActionResult> {
        const spotify = this.spotify;
        return async (index: number, creatorId: string) => {
            const device = devices[index];
            if (!device) {
                return { success: false, message: `:${this.optionEmojis[index]}: is not a valid response` };
            }
            try {
                await spotify.setDeviceId(device.id);
                return { success: true, message: `<${creatorId}> set device to ${device.name}` };
            } catch (error) {
                console.error(error);
                return { success: false, message: `Error setting device to ${device.name}` };
            }
        };
    }

    public async promptSelection(): Promise<IActionOption> {
        let devices: IDevice[];
        try {
            devices = await this.spotify.getAvailableDevices();
        } catch (error) {
            console.error(error);
            return { success: false, message: "Error getting devices" };
        }
        devices = devices.slice(0, this.optionEmojis.length);
        const message = this.getOutputString(devices);
        const callback = this.getOptionCallback(devices);
        return {
            success: true,
            message,
            callback
        };
    }
}
