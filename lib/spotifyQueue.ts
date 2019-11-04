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
const DEFAULT_TRACK_LIMIT = config.get("DEFAULT_TRACK_LIMIT");

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
    groupName?: string;
}

export interface ISearchResult extends IResource {
    name: string;
}

interface ICommandResult {
    success: boolean;
    message?: string;
    searchResults?: ISearchResult[];
}

function getCurrentTime(): number {
    return new Date().getTime() / 1000;
}

function getObjectName(objectInfo: SpotifyApi.TrackObjectSimplified | SpotifyApi.AlbumObjectSimplified): string {
    let nameString;
    let artistsString;
    if (objectInfo.name) {
        nameString = objectInfo.name;
    } else {
        nameString = "Unknown";
    }
    if (objectInfo.artists) {
        artistsString = "";
        for (let i = 0; i < Math.min(objectInfo.artists.length, 3); i++) {
            const artistObject = objectInfo.artists[i];
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

export class SpotifyQueue {
    private queue: ITrack[];
    private tokenExpirationEpoch: number;
    private active: boolean;
    private currentTrackNumber: number;
    private currentGroupNumber: number;
    private currentTrack: ITrack;
    private deviceId: string;
    private volume: number;

    constructor() {
        this.queue = [];
        this.currentTrackNumber = 0;
        this.currentGroupNumber = 0;
        this.tokenExpirationEpoch = 0;
        this.active = false;
        this.volume = 100;
    }

    public isActive() {
        return this.active;
    }

    public clearQueue() {
        this.queue = [];
    }

    public getQueueLength() {
        return this.queue.length;
    }

    public getCurrentTrackNumber(): number {
        return this.currentTrackNumber;
    }

    public getCurrentGroupNumber(): number {
        return this.currentGroupNumber;
    }

    public authorize(): Promise<any> {
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

    public addResourceToQueue(resource: IResource, userId: string, trackLimit?: number): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            const addPromise =
                resource.type === "track"
                    ? spotifyQueue.addTrackToQueue(resource.id, userId)
                    : resource.type === "album"
                    ? spotifyQueue.addAlbumToQueue(resource.id, userId, trackLimit)
                    : spotifyQueue.addPlaylistToQueue(resource.id, userId, trackLimit);
            addPromise
                .then(function(addResult) {
                    if (addResult.success) {
                        if (!spotifyQueue.currentTrack) {
                            spotifyQueue
                                .playNextTrack()
                                .then(function(playResult) {
                                    if (playResult.success) {
                                        resolve(addResult);
                                    } else {
                                        resolve(playResult);
                                    }
                                })
                                .catch(function(error) {
                                    reject(error);
                                });
                            return;
                        }
                    }
                    resolve(addResult);
                })
                .catch(function(error) {
                    reject(error);
                });
        });
    }

    public playNextTrack(): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            if (spotifyQueue.queue.length === 0) {
                spotifyQueue.active = false;
                resolve({
                    success: false,
                    message: "The queue is empty"
                });
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
                            return spotifyApi
                                .play({
                                    uris: [track.uri],
                                    device_id: spotifyQueue.deviceId
                                })
                                .then(function() {
                                    console.log(
                                        `playing ${track.name} will finish in ${track.duration_ms} miliseconds`
                                    );

                                    const newGroup = spotifyQueue.currentTrack
                                        ? track.groupName !== spotifyQueue.currentTrack.groupName
                                        : true;

                                    if (newGroup) {
                                        spotifyQueue.currentGroupNumber += 1;
                                    }

                                    spotifyQueue.queue = spotifyQueue.queue.slice(1, spotifyQueue.queue.length);
                                    spotifyQueue.currentTrackNumber = spotifyQueue.currentTrackNumber + 1;
                                    const thisPlayNumber = spotifyQueue.currentTrackNumber;
                                    spotifyQueue.currentTrack = track;
                                    spotifyQueue.active = true;

                                    setTimeout(function() {
                                        spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                                    }, track.duration_ms);

                                    resolve({
                                        success: true,
                                        message: track.name
                                    });
                                })
                                .catch(function(error) {
                                    // TODO: Handle attempting to play a bad track
                                    console.error(error);
                                    resolve({
                                        success: false,
                                        message: "Unable to play the current track"
                                    });
                                });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "No device found"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    public stop(): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            return spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .pause({
                            device_id: spotifyQueue.deviceId
                        })
                        .then(function() {
                            spotifyQueue.active = false;
                            spotifyQueue.currentTrack = null;
                            resolve({
                                success: true
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "Unable to stop the current track"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    public getDevicesString(): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            return spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .getMyDevices()
                        .then(function(response) {
                            const devices = response.body.devices;
                            let devicesString = "Devices:";
                            for (const device of devices) {
                                devicesString = `${devicesString}\n*${device.name}*: \`${device.id}\``;
                            }
                            resolve({
                                success: true,
                                message: devicesString
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "Could not load devices from Spotify"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    private generateSearchResult(object: SpotifyApi.TrackObjectFull | SpotifyApi.AlbumObjectSimplified): ISearchResult {
        return {
            name: getObjectName(object),
            type: object.type,
            id: object.id
        };
    }

    public searchForItem(query: string): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve) {
            spotifyApi
                .search(query, ["album", "track"], { limit: 3 })
                .then(function(response) {
                    const results = [];

                    for (const object of response.body.tracks.items) {
                        const result = spotifyQueue.generateSearchResult(object);
                        results.push(result);
                    }
                    for (const object of response.body.albums.items) {
                        const result = spotifyQueue.generateSearchResult(object);
                        results.push(result);
                    }

                    resolve({
                        success: true,
                        searchResults: results
                    });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Search request failed"
                    });
                });
        });
    }

    public setDeviceId(deviceId: string): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .getMyDevices()
                        .then(function(response) {
                            const devices = response.body.devices;
                            const deviceValid = devices.find(function(device) {
                                if (device.id === deviceId && !device.is_restricted) {
                                    return true;
                                }
                            });
                            if (deviceValid) {
                                spotifyQueue.deviceId = deviceId;
                                spotifyApi
                                    .setRepeat({
                                        state: "off",
                                        device_id: spotifyQueue.deviceId
                                    })
                                    .then(function() {
                                        return spotifyApi.setVolume(spotifyQueue.volume, {
                                            device_id: spotifyQueue.deviceId
                                        });
                                    })
                                    .then(function() {
                                        resolve({
                                            success: true
                                        });
                                    })
                                    .catch(function(error) {
                                        console.error(error);
                                        resolve({
                                            success: false,
                                            message: "Unable to configure new device"
                                        });
                                    });
                            } else {
                                resolve({
                                    success: false,
                                    message: "The deviceId given is invalid for use"
                                });
                            }
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "Could not load devices from Spotify"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    public setVolume(percentDelta: number, userId: string): Promise<ICommandResult> {
        const spotifyQueue = this;
        return new Promise(function(resolve) {
            const newVolume = Math.max(Math.min(spotifyQueue.volume + percentDelta, 100), 0);
            const directionText = percentDelta > 0 ? "up" : "down";
            spotifyQueue.volume = newVolume;
            if (!spotifyQueue.deviceId) {
                resolve({
                    success: true,
                    message: `<@${userId}> turned the volume ${directionText} to ${newVolume}%`
                });
                return;
            }
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .setVolume(newVolume, {
                            device_id: spotifyQueue.deviceId
                        })
                        .then(function() {
                            resolve({
                                success: true,
                                message: `<@${userId}> turned the volume ${directionText} to ${newVolume}%`
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "Failed to set volume"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    public getCurrentTrackName(withAuthor?: boolean): string | null {
        if (this.active) {
            if (withAuthor) {
                return `${this.currentTrack.name} (<@${this.currentTrack.userId}>)`;
            } else {
                return this.currentTrack.name;
            }
        }
    }

    public getCurrentGroupName(): string | null {
        if (this.currentTrack) {
            return this.currentTrack.groupName;
        }
    }

    public removeCurrentGroupFromQueue() {
        const currentGroupName = this.getCurrentGroupName();

        if (this.queue.length > 0) {
            let nextTrackIndex: number;
            for (let i = 0; i < this.queue.length; i++) {
                const track = this.queue[i];
                if (track.groupName === currentGroupName) {
                    nextTrackIndex = i;
                }
            }

            this.queue = this.queue.slice(nextTrackIndex + 1, this.queue.length);
        }
    }

    private addAlbumToQueue(albumId: string, userId: string, trackLimit?: number): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .getAlbum(albumId)
                        .then(function(response) {
                            const albumName = getObjectName(response.body);
                            const tracks = response.body.tracks.items;
                            const limit = trackLimit ? trackLimit : +DEFAULT_TRACK_LIMIT;
                            const tracksAdded = Math.min(limit, tracks.length);
                            spotifyQueue.addSeveralTracksToQueue(tracks, userId, albumName, limit);
                            resolve({
                                success: true,
                                message: `${tracksAdded} tracks from album ${albumName}`
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "The resouce given is invalid"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    private addPlaylistToQueue(playlistId: string, userId: string, trackLimit?: number): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .getPlaylist(playlistId)
                        .then(function(response) {
                            const playlistName = response.body.name;
                            const playlistTracks = response.body.tracks.items;
                            const tracks = playlistTracks.map(function(playlistTrack) {
                                return playlistTrack.track;
                            });
                            const limit = trackLimit ? trackLimit : +DEFAULT_TRACK_LIMIT;
                            const tracksAdded = Math.min(limit, tracks.length);
                            spotifyQueue.addSeveralTracksToQueue(tracks, userId, playlistName, limit);
                            resolve({
                                success: true,
                                message: `${tracksAdded} tracks from playlist ${playlistName}`
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "The resouce given is invalid"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    private addTrackToQueue(trackId: string, userId: string): Promise<ICommandResult> {
        const spotifyQueue: SpotifyQueue = this;
        return new Promise(function(resolve, reject) {
            spotifyQueue
                .refreshTokenIfRequired()
                .then(function() {
                    return spotifyApi
                        .getTrack(trackId)
                        .then(function(response) {
                            const track = spotifyQueue.createTrackEntry(response.body, userId);
                            spotifyQueue.queue.push(track);

                            resolve({
                                success: true,
                                message: track.name
                            });
                        })
                        .catch(function(error) {
                            console.error(error);
                            resolve({
                                success: false,
                                message: "The resouce given is invalid"
                            });
                        });
                })
                .catch(function(error) {
                    console.error(error);
                    resolve({
                        success: false,
                        message: "Could not authenticate with Spotify"
                    });
                });
        });
    }

    private refreshTokenIfRequired(): Promise<string> {
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

    private createTrackEntry(trackInfo: SpotifyApi.TrackObjectSimplified, userId: string, groupName?: string): ITrack {
        const name = getObjectName(trackInfo);
        const duration_ms = trackInfo.duration_ms;

        const uri = trackInfo.uri;
        const trackId = trackInfo.id;
        const groupNumber = this.currentGroupNumber;

        const track: ITrack = {
            name,
            duration_ms,
            uri,
            trackId,
            userId,
            groupName
        };

        return track;
    }

    private addSeveralTracksToQueue(
        tracks: SpotifyApi.TrackObjectSimplified[],
        userId: string,
        groupName: string,
        trackLimit: number
    ): void {
        const spotifyQueue: SpotifyQueue = this;
        for (let i = 0; i < Math.min(tracks.length, trackLimit); i++) {
            const trackInfo = tracks[i];
            const track = spotifyQueue.createTrackEntry(trackInfo, userId, groupName);
            spotifyQueue.queue.push(track);
        }
    }

    private checkIfTrackEnded(thisPlayNumber: number, track: ITrack): void {
        const spotifyQueue: SpotifyQueue = this;
        // Check to see if the queue has moved onto the next track already, or if the queue is not active
        if (thisPlayNumber !== spotifyQueue.currentTrackNumber || !spotifyQueue.active) {
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
                        console.error(error);
                        console.log("Failed to move onto next track. Retrying in 10 seconds");
                        setTimeout(function() {
                            spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                        }, 10000);
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
                console.error(error);
                console.log("Failed to assess playback state, retrying in 2 seconds");
                setTimeout(function() {
                    spotifyQueue.checkIfTrackEnded(thisPlayNumber, track);
                }, 2000);
            });
    }

    private findDeviceId(): Promise<null> {
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
                        spotifyQueue.deviceId = activeDevice.id;
                        spotifyApi
                            .setRepeat({
                                state: "off",
                                device_id: spotifyQueue.deviceId
                            })
                            .then(function() {
                                return spotifyApi.setVolume(spotifyQueue.volume, {
                                    device_id: spotifyQueue.deviceId
                                });
                            })
                            .then(function() {
                                resolve();
                            })
                            .catch(function(error) {
                                console.error(error);
                                reject();
                            });
                    } else {
                        reject();
                    }
                })
                .catch(function(error) {
                    console.error(error);
                    reject();
                });
        });
    }
}
