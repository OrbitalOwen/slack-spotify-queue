// Provides an abstraction of the SpotifyWebApi suitable for this project

import SpotifyWebApi from "spotify-web-api-node";
import express from "express";
import openUrl from "open";
import winston from "winston";

import { Config } from "./Config";
import getSpotifyObjectName from "./getSpotifyObjectName";

const SCOPES = ["user-read-playback-state", "user-read-currently-playing", "user-modify-playback-state"];

export interface IPlaybackInfo {
    isPlaying: boolean;
    progressMs?: number;
    trackUri?: string;
}

export interface ISearchResult {
    name: string;
    type: "track" | "album";
    id: string;
}

export interface ITrackEntry {
    name: string;
    uri: string;
    durationMs: number;
    isPlayable: boolean;
}

export interface IGroupEntry {
    name: string;
    tracks: ITrackEntry[];
}

export interface IDevice {
    name: string;
    id: string;
}

function getCurrentTime(): number {
    return new Date().getTime() / 1000;
}

export class Spotify {
    public volume: number;
    public deviceId: string;
    private tokenExpirationEpoch: number;
    private webApi: SpotifyWebApi;
    private config: Config;

    constructor(config: Config) {
        this.volume = 50;
        this.tokenExpirationEpoch = 0;
        this.config = config;
        const configData = config.get();
        this.webApi = new SpotifyWebApi({
            redirectUri: `http://localhost:${configData.AUTH_PORT}/callback`,
            clientId: configData.SPOTIFY_CLIENT_ID,
            clientSecret: configData.SPOTIFY_CLIENT_SECRET
        });
    }

    private async refreshTokenIfRequired(): Promise<void> {
        if (getCurrentTime() > this.tokenExpirationEpoch - 300) {
            const response = await this.webApi.refreshAccessToken();
            this.webApi.setAccessToken(response.body.access_token);
            this.tokenExpirationEpoch = getCurrentTime() + response.body.expires_in;
        }
    }

    public authorize(): Promise<void> {
        const spotify = this;
        return new Promise(function(resolve, reject) {
            const configData = spotify.config.get();
            if (!configData.SPOTIFY_ACCESS_TOKEN && !configData.SPOTIFY_REFRESH_TOKEN) {
                // No auth code is available, we need to prompt the spotify authentication flow to get one
                const expressApp = new express();
                let expressServer;

                expressApp.get("/callback", async function(request, response) {
                    const authCode = request.query.code;
                    const authResponse = await spotify.webApi.authorizationCodeGrant(authCode);

                    spotify.webApi.setAccessToken(authResponse.body.access_token);
                    spotify.webApi.setRefreshToken(authResponse.body.refresh_token);
                    spotify.tokenExpirationEpoch = getCurrentTime() + authResponse.body.expires_in;

                    response.send("You may now close this window.");
                    expressServer.close();

                    await spotify.config.write("SPOTIFY_ACCESS_TOKEN", authResponse.body.access_token);
                    await spotify.config.write("SPOTIFY_REFRESH_TOKEN", authResponse.body.refresh_token);

                    resolve();
                });

                expressServer = expressApp.listen(+configData.AUTH_PORT);

                const authorizeURL = spotify.webApi.createAuthorizeURL(SCOPES, "");
                openUrl(authorizeURL).catch((error) => {
                    winston.error("Error creating spotify authorization URL.", { error });
                });
            } else {
                // We already have an auth code stored
                spotify.webApi.setAccessToken(configData.SPOTIFY_ACCESS_TOKEN);
                spotify.webApi.setRefreshToken(configData.SPOTIFY_REFRESH_TOKEN);
                spotify
                    .refreshTokenIfRequired()
                    .then(function() {
                        resolve();
                    })
                    .catch(reject);
            }
        });
    }

    public async play(uri: string, positionMs?: number): Promise<void> {
        winston.debug("Playing resource", { uri });
        await this.refreshTokenIfRequired();
        await this.webApi.setRepeat({
            device_id: this.deviceId,
            state: "off"
        });
        await this.webApi.setVolume(this.volume, {
            device_id: this.deviceId
        });
        await this.webApi.play({
            device_id: this.deviceId,
            uris: [uri],
            position_ms: positionMs
        });
    }

    public async pause(): Promise<void> {
        await this.refreshTokenIfRequired();
        await this.webApi.pause({
            device_id: this.deviceId
        });
    }

    public async setVolume(volume: number): Promise<void> {
        this.volume = volume;
        await this.refreshTokenIfRequired();
        await this.webApi.setVolume(volume, {
            device_id: this.deviceId
        });
    }

    public async getPlaybackInfo(): Promise<IPlaybackInfo> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getMyCurrentPlayingTrack();
        const trackUri = response.body.item ? response.body.item.uri : null;
        return {
            isPlaying: response.body.is_playing,
            progressMs: response.body.progress_ms,
            trackUri
        };
    }

    public async setDeviceId(deviceId: string): Promise<void> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getMyDevices();
        const devices = response.body.devices;
        const deviceValid = devices.find(function(device: SpotifyApi.UserDevice) {
            if (device.id === deviceId && !device.is_restricted) {
                return true;
            }
        });
        if (!deviceValid) {
            throw new Error("Device is not valid");
        }
        this.deviceId = deviceId;
        winston.info("Set deviceId", { deviceId });
        await this.webApi.transferMyPlayback({
            device_ids: [deviceId]
        });
    }

    public async getAvailableDevices(): Promise<IDevice[]> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getMyDevices();

        const devices = response.body.devices;
        return devices
            .filter(function(device) {
                return !device.is_restricted;
            })
            .map(function(device) {
                return {
                    name: device.name,
                    id: device.id
                };
            });
    }

    public async search(query: string): Promise<ISearchResult[]> {
        await this.refreshTokenIfRequired();
        const configData = this.config.get();
        const response = await this.webApi.search(query, ["album", "track"], { limit: configData.SEARCH_LIMIT });
        const trackResults = response.body.tracks.items.map(function(object): ISearchResult {
            return {
                name: getSpotifyObjectName(object),
                type: "track",
                id: object.id
            };
        });
        const albumResults = response.body.albums.items.map(function(object): ISearchResult {
            return {
                name: getSpotifyObjectName(object),
                type: "album",
                id: object.id
            };
        });
        const results = trackResults.concat(albumResults);
        return results;
    }

    private getTrackEntry(track: SpotifyApi.TrackObjectSimplified): ITrackEntry {
        const name = getSpotifyObjectName(track);
        const uri = track.uri;
        const durationMs = track.duration_ms;
        const isPlayable = track.is_playable;
        return {
            name,
            uri,
            durationMs,
            isPlayable
        };
    }

    public async getTrack(id: string): Promise<ITrackEntry> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getTrack(id, { market: "from_token" });
        const trackObject = response.body;
        return this.getTrackEntry(trackObject);
    }

    public async getAlbum(id: string): Promise<IGroupEntry> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getAlbum(id, { market: "from_token" });
        const albumObject = response.body;
        const name = getSpotifyObjectName(albumObject);
        const tracks = [];
        for (const trackObject of albumObject.tracks.items) {
            const track = this.getTrackEntry(trackObject);
            if (track.isPlayable) {
                tracks.push(track);
            }
        }
        return {
            name,
            tracks
        };
    }

    public async getPlaylist(id: string): Promise<IGroupEntry> {
        await this.refreshTokenIfRequired();
        const response = await this.webApi.getPlaylist(id, { market: "from_token" });
        const playlistObject = response.body;
        const name = playlistObject.name;
        const tracks = [];
        for (const playlistTrackObject of playlistObject.tracks.items) {
            const track = this.getTrackEntry(playlistTrackObject.track);
            if (track.isPlayable) {
                tracks.push(track);
            }
        }
        return {
            name,
            tracks
        };
    }
}
