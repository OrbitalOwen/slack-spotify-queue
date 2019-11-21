import SpotifyWebApi from "spotify-web-api-node";
import express from "express";
import openUrl from "open";
import Config from "./config";
import getSpotifyObjectName from "./getSpotifyObjectName";

const SCOPES = ["user-read-playback-state", "user-read-currently-playing", "user-modify-playback-state"];

interface IResponse<T> {
    body: T;
    headers: Record<string, string>;
    statusCode: number;
}

interface IPlaybackInfo {
    isPlaying: boolean;
    progressMs?: number;
    trackId?: string;
}

interface ISearchResult {
    name: string;
    type: "track" | "album";
    id: string;
}

function getCurrentTime(): number {
    return new Date().getTime() / 1000;
}

export default class Spotify {
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

    private refreshTokenIfRequired(): Promise<string> {
        const spotify = this;
        return new Promise(function(resolve, reject) {
            if (getCurrentTime() > spotify.tokenExpirationEpoch - 300) {
                spotify.webApi
                    .refreshAccessToken()
                    .then(function(data) {
                        spotify.webApi.setAccessToken(data.body.access_token);
                        spotify.tokenExpirationEpoch = getCurrentTime() + data.body.expires_in;
                        resolve();
                    })
                    .catch(reject);
            } else {
                resolve();
            }
        });
    }

    public authorize(): Promise<void> {
        const spotify = this;
        return new Promise(function(resolve, reject) {
            const configData = spotify.config.get();
            if (!configData.SPOTIFY_ACCESS_TOKEN && !configData.SPOTIFY_REFRESH_TOKEN) {
                // No auth code is available, we need to prompt the spotify authentication flow to get one
                const expressApp = new express();
                let expressServer;

                expressApp.get("/callback", function(request, response) {
                    const authCode = request.query.code;
                    spotify.webApi
                        .authorizationCodeGrant(authCode)
                        .then(function(data) {
                            spotify.webApi.setAccessToken(data.body.access_token);
                            spotify.webApi.setRefreshToken(data.body.refresh_token);
                            spotify.tokenExpirationEpoch = getCurrentTime() + data.body.expires_in;
                            response.send("You may now close this window.");
                            expressServer.close();
                            return Promise.all([
                                spotify.config.write("SPOTIFY_ACCESS_TOKEN", data.body.access_token),
                                spotify.config.write("SPOTIFY_REFRESH_TOKEN", data.body.refresh_token)
                            ]);
                        })
                        .then(function() {
                            resolve();
                        })
                        .catch(reject);
                });

                expressServer = expressApp.listen(+configData.AUTH_PORT);

                const authorizeURL = spotify.webApi.createAuthorizeURL(SCOPES, "");
                openUrl(authorizeURL).catch(console.error);
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

    public play(uri: string, positionMs?: number): Promise<IResponse<void>> {
        const spotify = this;
        return spotify.refreshTokenIfRequired().then(function() {
            return spotify.webApi
                .setRepeat({
                    device_id: spotify.deviceId,
                    state: "off"
                })
                .then(function() {
                    return spotify.webApi.setVolume(spotify.volume, {
                        device_id: spotify.deviceId
                    });
                })
                .then(function() {
                    return spotify.webApi.play({
                        device_id: spotify.deviceId,
                        uris: [uri],
                        position_ms: positionMs
                    });
                });
        });
    }

    public pause(): Promise<IResponse<void>> {
        const spotify = this;
        return spotify.refreshTokenIfRequired().then(function() {
            return spotify.webApi.pause({
                device_id: spotify.deviceId
            });
        });
    }

    public setVolume(volume: number): Promise<IResponse<void>> {
        const spotify = this;
        spotify.volume = volume;
        return spotify.refreshTokenIfRequired().then(function() {
            return spotify.webApi.setVolume(volume, {
                device_id: spotify.deviceId
            });
        });
    }

    public getPlaybackInfo(): Promise<IPlaybackInfo> {
        const spotify = this;
        return new Promise(function(resolve, reject) {
            spotify
                .refreshTokenIfRequired()
                .then(function() {
                    return spotify.webApi.getMyCurrentPlayingTrack().then(function(response) {
                        const trackId = response.body.item ? response.body.item.id : null;
                        resolve({
                            isPlaying: response.body.is_playing,
                            progressMs: response.body.progress_ms,
                            trackId
                        });
                    });
                })
                .catch(reject);
        });
    }

    public setDeviceId(deviceId: string): Promise<IResponse<void>> {
        const spotify = this;
        return spotify.refreshTokenIfRequired().then(function() {
            return spotify.webApi.getMyDevices().then(function(response) {
                const devices = response.body.devices;
                const deviceValid = devices.find(function(device: SpotifyApi.UserDevice) {
                    if (device.id === deviceId && !device.is_restricted) {
                        return true;
                    }
                });
                if (!deviceValid) {
                    throw new Error("Device is not valid");
                }
                spotify.deviceId = deviceId;
                return spotify.webApi.transferMyPlayback({
                    device_ids: [deviceId],
                    play: false
                });
            });
        });
    }

    public getAvailableDeviceIds(): Promise<string[]> {
        const spotify = this;
        return spotify.refreshTokenIfRequired().then(function() {
            return spotify.webApi.getMyDevices().then(function(response) {
                const devices = response.body.devices;
                return devices
                    .filter(function(device) {
                        return !device.is_restricted;
                    })
                    .map(function(device) {
                        return device.id;
                    });
            });
        });
    }

    public search(query: string): Promise<ISearchResult[]> {
        const spotify = this;
        return new Promise(function(resolve, reject) {
            spotify
                .refreshTokenIfRequired()
                .then(function() {
                    const configData = spotify.config.get();
                    return spotify.webApi.search(query, ["album", "track"], { limit: configData.SEARCH_LIMIT });
                })
                .then(function(response) {
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
                    resolve(results);
                })
                .catch(reject);
        });
    }
}
