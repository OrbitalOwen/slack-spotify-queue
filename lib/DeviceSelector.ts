// A safe interface for device selection
import winston from "winston";

import { Spotify, IDevice } from "./Spotify";
import { Config } from "./Config";
import { IActionResult, ICommandResponse } from "./CommandTypes";

export class DeviceSelector {
    private spotify: Spotify;
    private optionEmojis: string[];

    constructor(config: Config, spotify: Spotify) {
        this.optionEmojis = config.get().OPTION_EMOJIS;
        this.spotify = spotify;
    }

    private getOutputString(devices: IDevice[], currentDevice: IDevice | undefined): string {
        let outputString = "";
        if (currentDevice) {
            outputString += `*Current device:* ${currentDevice.name}\n`;
        }
        outputString += "*Available devices:*\n";
        for (const [index, device] of Object.entries(devices)) {
            outputString += `\n:${this.optionEmojis[index]}: ${device.name}`;
        }
        outputString += "\n\nReact to select device";
        return outputString;
    }

    private getOptionCallback(devices: IDevice[]): (index: number, creatorId: string) => Promise<ICommandResponse> {
        const spotify = this.spotify;
        return async (index: number, creatorId: string) => {
            const device = devices[index];
            if (!device) {
                return { success: false, message: `:${this.optionEmojis[index]}: is not a valid response`, type: "dm" };
            }
            try {
                await spotify.setDevice(device);
                return { success: true, message: `<@${creatorId}> set device to ${device.name}`, type: "broadcast" };
            } catch (error) {
                winston.error("Error setting device", { error });
                return { success: false, message: `Error setting device to ${device.name}`, type: "dm" };
            }
        };
    }

    public async promptSelection(): Promise<IActionResult> {
        let devices: IDevice[];
        try {
            devices = await this.spotify.getAvailableDevices();
        } catch (error) {
            winston.error("Error getting devices", { error });
            return { success: false, message: "Error getting devices" };
        }
        const currentDevice = this.spotify.getCurrentDevice();
        devices = devices.slice(0, this.optionEmojis.length);
        const message = this.getOutputString(devices, currentDevice);
        const callback = this.getOptionCallback(devices);
        return {
            success: true,
            message,
            callback
        };
    }

    public async autoSelectDevice() {
        try {
            const devices = await this.spotify.getAvailableDevices();
            const device = devices[0];
            if (!device) {
                throw new Error("No device available");
            }
            await this.spotify.setDevice(device);
        } catch (error) {
            winston.error("Error auto-selecting device", { error });
        }
    }
}
