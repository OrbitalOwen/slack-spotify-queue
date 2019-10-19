import SpotifyWebApi from "spotify-web-api-node";
import express from "express";
import openUrl from "open";
import { IResource } from "./identifySpotifyResource";

import config from "./config";

const SPOTIFY_ACCESS_TOKEN = config.get("SPOTIFY_ACCESS_TOKEN");
const SPOTIFY_REFRESH_TOKEN = config.get("SPOTIFY_REFRESH_TOKEN");
const AUTH_PORT = config.get("AUTH_PORT");
const SPOTIFY_CLIENT_ID = config.get("SPOTIFY_CLIENT_ID");
const SPOTIFY_CLIENT_SECRET = config.get("SPOTIFY_CLIENT_SECRET");

const scopes = ["user-read-playback-state", "user-read-currently-playing", "user-modify-playback-state"];

const spotifyApi = new SpotifyWebApi({
    redirectUri: `http://localhost:${AUTH_PORT}/callback`,
    clientId: SPOTIFY_CLIENT_ID,
    clientSecret: SPOTIFY_CLIENT_SECRET
});

interface ITrack {
    name: string;
    duration_ms: number;
    uri: string;
    trackId: string;
    userId: string;
}

function getCurrentTime(): number {
    return new Date().getTime() / 1000;
}

function getObjectName(objectInfo: SpotifyApi.SingleAlbumResponse | SpotifyApi.TrackObjectSimplified): string {
    let nameString;
    let artistsString;
    if (objectInfo.name) {
        nameString = objectInfo.name;
    } else {
        nameString = "Unknown";
    }
    if (objectInfo.artists) {
        artistsString = "";
        for (const artistObject of objectInfo.artists) {
            const artistName = artistObject.name ? artistObject.name : "Unknown";
            if (artistsString !== "") {
                artistsString = artistsString + ", " + artistName;
            } else {
                artistsString = artistName;
            }
        }
    } else {
        artistsString = "Unknown";
    }

    return `${nameString} by ${artistsString}`;
}

export default class SpotifyQueue {
    private queue: ITrack[];
    private tokenExpirationEpoch: number;
    private active: boolean;
    private currentPlayNumber: number;
    private currentTrack: ITrack;
    private deviceId: string;

    constructor() {
        this.queue = [];
        this.currentPlayNumber = 0;
        this.tokenExpirationEpoch = 0;
        this.active = false;
    }

    public isActive() {
        return this.active;
    }

    public clearQueue() {
        this.queue = [];
    }

    public getCurrentPlayNumber(): number {
        return this.currentPlayNumber;
    }

    public authorize(): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            if (!SPOTIFY_ACCESS_TOKEN && !SPOTIFY_REFRESH_TOKEN) {
                // No auth code is availible, we need to prompt the spotify authentication flow to get one
                const expressApp = express();
                let expressServer;

                expressApp.get("/callback", function(request, response) {
                    const authCode = request.query.code;
                    spotifyApi
                        .authorizationCodeGrant(authCode)
                        .then(function(data) {
                            spotifyApi.setAccessToken(data.body.access_token);
                            spotifyApi.setRefreshToken(data.body.refresh_token);
                            spotifyQueue.tokenExpirationEpoch = getCurrentTime() + data.body.expires_in;
                            response.send("You may now close this window.");
                            expressServer.close();
                            return Promise.all([
                                config.write("SPOTIFY_ACCESS_TOKEN", data.body.access_token),
                                config.write("SPOTIFY_REFRESH_TOKEN", data.body.refresh_token)
                            ]);
                        })
                        .then(function() {
                            resolve();
                        })
                        .catch(function(error) {
                            reject(error);
                        });
                });

                expressServer = expressApp.listen(+AUTH_PORT);

                const authorizeURL = spotifyApi.createAuthorizeURL(scopes, "");
                openUrl(authorizeURL);
            } else {
                // We already have an auth code stored
                spotifyApi.setAccessToken(SPOTIFY_ACCESS_TOKEN);
                spotifyApi.setRefreshToken(SPOTIFY_REFRESH_TOKEN);
                spotifyQueue
                    .refreshTokenIfRequired()
                    .then(function() {
                        resolve();
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            }
        });
    }

    public getStatusString(): string {
        const currentTrackName = this.getCurrentTrackName(true);
        let queueString: string;
        if (currentTrackName) {
            queueString = `*Now playing:*\n${currentTrackName}\n*Queue is:*`;
        } else {
            queueString = "*Queue is:*";
            if (this.queue.length === 0) {
                return "Queue empty";
            }
        }

        for (let i = 0; i < Math.min(this.queue.length, 10); i++) {
            const trackObject = this.queue[i];
            const position = i + 1;
            queueString = `${queueString}\n${position}: ${trackObject.name} (<@${trackObject.userId}>)`;
        }

        const excess = Math.max(0, this.queue.length - 10);
        if (excess > 0) {
            queueString = `${queueString}\n+${excess} more`;
        }

        return queueString;
    }

    public addResourceToQueue(resource: IResource, userId: string): Promise<string | null> {
        if (resource.type === "track") {
            return this.addTrackToQueue(resource.id, userId);
        } else if (resource.type === "album") {
            return this.addAlbumToQueue(resource.id, userId);
        } else if (resource.type === "playlist") {
            return this.addPlaylistToQueue(resource.id, userId);
        }
    }

    public playNextTrack(): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            if (spotifyQueue.queue.length === 0) {
                spotifyQueue.active = false;
                reject("Queue is empty.");
                return;
            }

            const track = spotifyQueue.queue[0];

            return spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    const findDevicePromise = !spotifyQueue.deviceId
                        ? spotifyQueue.findDeviceId()
                        : Promise.resolve(null);
                    return findDevicePromise
                        .then(function() {
                            return spotifyApi.setRepeat({
                                state: "off",
                                device_id: spotifyQueue.deviceId
                            });
                        })
                        .then(function() {
                            return spotifyApi.play({
                                uris: [track.uri],
                                device_id: spotifyQueue.deviceId
                            });
                        })
                        .then(function() {
                            console.log(`playing ${track.name} will finish in ${track.duration_ms} miliseconds`);

                            spotifyQueue.queue = spotifyQueue.queue.slice(1, spotifyQueue.queue.length);
                            spotifyQueue.currentPlayNumber = spotifyQueue.currentPlayNumber + 1;
                            const thisPlayNumber = spotifyQueue.currentPlayNumber;
                            spotifyQueue.currentTrack = track;
                            spotifyQueue.active = true;

                            setTimeout(function() {
                                spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                            }, track.duration_ms);

                            resolve(track.name);
                        })
                        .catch(function(error) {
                            // TODO: Handle attempting to play a bad track
                            console.error(error);
                            reject("Play request failed, ensure a device is online.");
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Failed to authenticate.");
                });
        });
    }

    public stop(): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            return spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.pause({
                        device_id: spotifyQueue.deviceId
                    });
                })
                .then(function() {
                    spotifyQueue.active = false;
                    resolve();
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Stop request failed, ensure a device is online.");
                });
        });
    }

    public getDevicesString(): Promise<string> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            return spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getMyDevices();
                })
                .then(function(response) {
                    const devices = response.body.devices;
                    let devicesString = "Devices:";
                    for (const device of devices) {
                        devicesString = `${devicesString}\n*${device.name}*: ${device.id}`;
                    }
                    resolve(devicesString);
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Failed to load devices");
                });
        });
    }

    public setDeviceId(deviceId: string): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getMyDevices();
                })
                .then(function(response) {
                    const devices = response.body.devices;
                    const deviceValid = devices.find(function(device) {
                        if (device.id === deviceId && !device.is_restricted) {
                            return true;
                        }
                    });
                    if (deviceValid) {
                        spotifyQueue.deviceId = deviceId;
                        resolve("Device set");
                    } else {
                        reject("Device requested not valid");
                    }
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Failed to load devices");
                });
        });
    }

    public getCurrentTrackName(withAuthor?: boolean): string {
        if (this.active) {
            if (withAuthor) {
                return `${this.currentTrack.name} (<@${this.currentTrack.userId}>)`;
            } else {
                return this.currentTrack.name;
            }
        }
    }

    private addAlbumToQueue(albumId: string, userId: string): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getAlbum(albumId).then(function(response) {
                        const albumName = getObjectName(response.body);
                        const tracks = response.body.tracks.items;
                        spotifyQueue.addSeveralTracksToQueue(tracks, userId);
                        resolve(`${tracks.length} tracks from album ${albumName}`);
                    });
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Could not add album tracks ");
                });
        });
    }

    private addPlaylistToQueue(playlistId: string, userId: string): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getPlaylist(playlistId).then(function(response) {
                        const playlistName = response.body.name;
                        const playlistTracks = response.body.tracks.items;
                        const tracks = playlistTracks.map(function(playlistTrack) {
                            return playlistTrack.track;
                        });
                        spotifyQueue.addSeveralTracksToQueue(tracks, userId);
                        resolve(`${tracks.length} tracks from playlist ${playlistName}`);
                    });
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Could not add playlist tracks");
                });
        });
    }

    private addTrackToQueue(trackId: string, userId: string): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getTrack(trackId);
                })
                .then(function(response) {
                    const track = spotifyQueue.createTrackEntry(response.body, userId);

                    spotifyQueue.queue.push(track);

                    if (!spotifyQueue.currentTrack && spotifyQueue.active && spotifyQueue.queue.length === 1) {
                        spotifyQueue.playNextTrack().catch(function(error) {
                            console.error(error);
                        });
                    }

                    resolve(track.name);
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Failed to add track to queue.");
                });
        });
    }

    private refreshTokenIfRequired(): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            if (getCurrentTime() > spotifyQueue.tokenExpirationEpoch - 300) {
                console.log("Refreshing access token");
                spotifyApi
                    .refreshAccessToken()
                    .then(function(data) {
                        spotifyApi.setAccessToken(data.body.access_token);
                        spotifyQueue.tokenExpirationEpoch = getCurrentTime() + data.body.expires_in;
                        resolve();
                    })
                    .catch(function(error) {
                        reject(error);
                    });
            } else {
                resolve();
            }
        });
    }

    private createTrackEntry(trackInfo: SpotifyApi.TrackObjectSimplified, userId: string): ITrack {
        const name = getObjectName(trackInfo);
        const duration_ms = trackInfo.duration_ms;

        const uri = trackInfo.uri;
        const trackId = trackInfo.id;

        const track: ITrack = {
            name,
            duration_ms,
            uri,
            trackId,
            userId
        };

        return track;
    }

    private addSeveralTracksToQueue(tracks: SpotifyApi.TrackObjectSimplified[], userId: string): void {
        const spotifyQueue: SpotifyQueue = this;
        for (const trackInfo of tracks) {
            const track = spotifyQueue.createTrackEntry(trackInfo, userId);
            spotifyQueue.queue.push(track);
        }
        if (spotifyQueue.active && spotifyQueue.queue.length === 1) {
            spotifyQueue.playNextTrack().catch(function(error) {
                console.error(error);
            });
        }
    }

    private checkIfTrackEnded(thisPlayNumber: number, track: ITrack): void {
        const spotifyQueue: SpotifyQueue = this;
        // Check to see if the queue has moved onto the next track already, or if the queue is not active
        if (thisPlayNumber !== spotifyQueue.currentPlayNumber || !spotifyQueue.active) {
            return;
        }
        spotifyQueue
            .refreshTokenIfRequired()
            .then(function() {
                return spotifyApi.getMyCurrentPlayingTrack();
            })
            .then(function(response) {
                const currentTrackId = response.body.item ? response.body.item.id : null;
                const timeLeft = response.body.progress_ms ? track.duration_ms - response.body.progress_ms : 0;

                if (currentTrackId === track.trackId || timeLeft <= 0) {
                    spotifyQueue.currentTrack = null;
                    spotifyQueue.playNextTrack().catch(function(error) {
                        console.log(error);
                    });
                } else {
                    // Check again after the remaining duration has elapsed
                    const timeToWait = Math.max(timeLeft, 1);
                    console.log(`Track not ended, retrying in ${timeToWait} miliseconds`);
                    setTimeout(function() {
                        spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                    }, timeToWait);
                }
            })
            .catch(function(error) {
                error.console.error(error);
                console.error("Failed to assess playback state, retrying in 2 seconds");
                setTimeout(function() {
                    spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                }, 2000);
            });
    }

    private findDeviceId(): Promise<string | null> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi.getMyDevices();
                })
                .then(function(response) {
                    const devices = response.body.devices;
                    let activeDevice = devices.find(function(device) {
                        if (device.is_active && !device.is_restricted) {
                            return true;
                        }
                    });
                    if (!activeDevice) {
                        activeDevice = devices.find(function(device) {
                            return !device.is_restricted;
                        });
                    }
                    if (activeDevice) {
                        return spotifyQueue.setDeviceId(activeDevice.id);
                    }
                })
                .then(function() {
                    resolve();
                })
                .catch(function(error) {
                    console.error(error);
                    reject("Error looking for device");
                });
        });
    }
}
