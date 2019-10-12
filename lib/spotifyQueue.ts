import SpotifyWebApi from 'spotify-web-api-node'
import express from 'express'
import openUrl from 'open'

const scopes = [
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state',
]

const spotifyApi = new SpotifyWebApi({
    redirectUri: `http://localhost:${process.env.AUTH_PORT}/callback`,
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET
});

interface Track {
    name: string,
    duration_ms: number,
    uri: string,
    trackId: string
}

function getCurrentTime(): number {
    return new Date().getTime() / 1000
}

function getObjectName(objectInfo: SpotifyApi.SingleAlbumResponse | SpotifyApi.TrackObjectSimplified): string {
    let nameString
    let artistsString
    if (objectInfo.name) {
        nameString = objectInfo.name
    } else {
        nameString = 'Unknown'
    }
    if (objectInfo.artists) {
        artistsString = ''
        for (const artistObject of objectInfo.artists) {
            let artistName = artistObject.name ? artistObject.name : 'Unknown'
            if (artistsString != '') {
                artistsString = artistsString + ', ' + artistName
            } else {
                artistsString = artistName
            }
        }
    } else {
        artistsString = 'Unknown'
    }

    return `${nameString} by ${artistsString}`
}

export default class SpotifyQueue {
    private queue: Track[]
    private tokenExpirationEpoch: number
    private active: boolean
    private currentPlayNumber: number
    private currentTrack: Track
    private deviceId: string

    constructor() {
        this.queue = []
        this.currentPlayNumber = 0
        this.tokenExpirationEpoch = 0
        this.active = false
    }

    isActive() {
        return this.active
    }

    clearQueue() {
        this.queue = []
    }

    getCurrentPlayNumber(): number {
        return this.currentPlayNumber
    }

    authorize(): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            const expressApp = express()
            let expressServer

            expressApp.get('/callback', function (request, response) {
                const authCode = request.query.code

                spotifyApi.authorizationCodeGrant(authCode).then(
                    function (data) {
                        spotifyApi.setAccessToken(data.body['access_token'])
                        spotifyApi.setRefreshToken(data.body['refresh_token'])
                        spotifyQueue.tokenExpirationEpoch = getCurrentTime() + data.body['expires_in']

                        response.send('You may now close this window.')
                        expressServer.close()
                        resolve()
                    }
                ).catch(function (error) {
                    reject(error)
                });
            })

            expressServer = expressApp.listen(+process.env.AUTH_PORT)

            const authorizeURL = spotifyApi.createAuthorizeURL(scopes, '')
            openUrl(authorizeURL)
        })
    };

    private refershTokenIfRequired(): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            if (getCurrentTime() > spotifyQueue.tokenExpirationEpoch - 300) {
                console.log('Refreshing access token')
                spotifyApi.refreshAccessToken().then(function (data) {
                    spotifyApi.setAccessToken(data.body['access_token']);
                    spotifyQueue.tokenExpirationEpoch = getCurrentTime() + data.body['expires_in']
                    resolve()
                }).catch(function (error) {
                    reject(error)
                })
            } else {
                resolve()
            }
        })
    }

    getCurrentTrackName(): string {
        if (this.active) {
            return this.currentTrack.name
        }
    }

    getStatusString(): string {
        const currentTrackName = this.getCurrentTrackName()
        let queueString: string
        if (currentTrackName) {
            queueString = `Now playing: ${currentTrackName}\nQueue is:`
        } else {
            queueString = 'Queue is:'
            if (this.queue.length == 0) {
                return 'Queue empty'
            }
        }

        for (var i = 0; i < Math.min(this.queue.length, 10); i++) {
            const trackObject = this.queue[i]
            const position = i + 1
            queueString = `${queueString}\n${position}: ${trackObject.name}`
        }

        let excess = Math.max(0, this.queue.length - 10)
        if (excess > 0) {
            queueString = `${queueString}\n+${excess} more`
        }

        return queueString
    }

    private createTrackEntry(trackInfo: SpotifyApi.TrackObjectSimplified): Track {
        const name = getObjectName(trackInfo)
        const duration_ms = trackInfo.duration_ms

        let uri = trackInfo.uri
        let trackId = trackInfo.id

        const track: Track = {
            name,
            duration_ms,
            uri,
            trackId
        }

        return track
    }

    private addSeveralTracksToQueue(tracks: SpotifyApi.TrackObjectSimplified[]): void {
        let spotifyQueue = this
        for (const trackInfo of tracks) {
            const track = spotifyQueue.createTrackEntry(trackInfo)
            spotifyQueue.queue.push(track)
        }
        if (spotifyQueue.active && spotifyQueue.queue.length == 1) {
            spotifyQueue.playNextTrack().catch(function (error) {
                console.error(error)
            })
        }
    }

    addAlbumToQueue(albumId: string): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getAlbum(albumId).then(function (response) {
                    let albumName = getObjectName(response.body)
                    let tracks = response.body.tracks.items
                    spotifyQueue.addSeveralTracksToQueue(tracks)
                    resolve(`${tracks.length} tracks from album ${albumName}`)
                })
            }).catch(function (error) {
                console.error(error)
                reject('Could not add album tracks ')
            })
        })
    }

    addPlaylistToQueue(playlistId: string): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getPlaylist(playlistId).then(function (response) {
                    const playlistName = response.body.name
                    const playlistTracks = response.body.tracks.items
                    const tracks = playlistTracks.map(function (playlistTrack) {
                        return playlistTrack.track
                    })
                    spotifyQueue.addSeveralTracksToQueue(tracks)
                    resolve(`${tracks.length} tracks from playlist ${playlistName}`)

                })
            }).catch(function (error) {
                console.error(error)
                reject('Could not add playlist tracks')
            })
        })
    }

    addTrackToQueue(trackId: string): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getTrack(trackId)
            }).then(function (response) {
                const track = spotifyQueue.createTrackEntry(response.body)

                spotifyQueue.queue.push(track)

                if (!spotifyQueue.currentTrack && spotifyQueue.active && spotifyQueue.queue.length == 1) {
                    spotifyQueue.playNextTrack().catch(function (error) {
                        console.error(error)
                    })
                }

                resolve(track.name)
            }).catch(function (error) {
                console.error(error)
                reject('Failed to add track to queue.')
            })
        })
    }

    private checkIfTrackEnded(thisPlayNumber: number, track: Track): void {
        const spotifyQueue = this
        // Check to see if the queue has moved onto the next track already
        if (thisPlayNumber != spotifyQueue.currentPlayNumber) {
            return
        }
        spotifyQueue.refershTokenIfRequired().then(function () {
            return spotifyApi.getMyCurrentPlayingTrack()
        }).then(function (response) {
            let currentTrackId = response.body.item ? response.body.item.id : null
            let timeLeft = response.body.progress_ms ? (track.duration_ms - response.body.progress_ms) : 0

            if (currentTrackId != track.trackId || timeLeft <= 0) {
                spotifyQueue.currentTrack = null
                spotifyQueue.playNextTrack().catch(function (error) {
                    console.log(error)
                })
            } else {
                // Check again after the remaining duration has elapsed
                const timeToWait = Math.max(timeLeft, 1)
                console.log(`Track not ended, retrying in ${timeToWait} miliseconds`)
                setTimeout(function () {
                    spotifyQueue.checkIfTrackEnded(thisPlayNumber, track)
                }, timeToWait)
            }
        }).catch(function (error) {
            error.console.error(error)
            console.error('Failed to assess playback state, retrying in 2 seconds')
            setTimeout(function () {
                spotifyQueue.checkIfTrackEnded(thisPlayNumber, track)
            }, 2000)
        })
    }

    stop(): Promise<string | null> {
        const spotifyQueue = this

        return new Promise(function (resolve, reject) {
            return spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.pause({
                    device_id: spotifyQueue.deviceId
                })
            }).then(function () {
                spotifyQueue.active = false
                resolve()
            }).catch(function (error) {
                console.error(error)
                reject('Stop request failed, ensure a device is online.')
            })
        })
    }

    getDevicesString(): Promise<string> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            return spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getMyDevices()
            }).then(function (response) {
                const devices = response.body.devices
                let devicesString = 'Devices:'
                for (const device of devices) {
                    devicesString = `${devicesString}\n*${device.name}*: ${device.id}`
                }
                resolve(devicesString)
            }).catch(function (error) {
                console.error(error)
                reject('Failed to load devices')
            })
        })
    }

    setDeviceId(deviceId: string): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getMyDevices()
            }).then(function (response) {
                const devices = response.body.devices
                const deviceValid = devices.find(function (device) {
                    if (device.id == deviceId && !device.is_restricted) {
                        return true
                    }
                })
                if (deviceValid) {
                    resolve("Device set")
                } else {
                    reject("Device requested not valid")
                }
            }).catch(function (error) {
                console.error(error)
                reject("Failed to load devices")
            })
        })
    }

    findDeviceId(): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getMyDevices()
            }).then(function (response) {
                const devices = response.body.devices
                let activeDevice = devices.find(function (device) {
                    if (device.is_active && !device.is_restricted) {
                        return true
                    }
                })
                if (!activeDevice) {
                    activeDevice = devices.find(function (device) {
                        return !device.is_restricted
                    })
                }
                if (activeDevice) {
                    this.setDeviceId(activeDevice.id)
                    resolve()
                } else {
                    reject("No device availible for playback")
                }
            }).catch(function (error) {
                console.error(error)
                reject("Error looking for device")
            })
        })
    }

    playNextTrack(): Promise<string | null> {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            if (spotifyQueue.queue.length == 0) {
                reject('Queue is empty.')
                return
            }

            const track = spotifyQueue.queue[0]

            return spotifyQueue.refershTokenIfRequired().then(function () {
                let findDevicePromise = !this.device_id ? spotifyQueue.findDeviceId() : Promise.resolve(null)
                return Promise.all([
                    findDevicePromise,
                    spotifyApi.setRepeat({
                        state: 'off',
                        device_id: spotifyQueue.deviceId
                    }),
                    spotifyApi.play({
                        uris: [track.uri],
                        device_id: spotifyQueue.deviceId
                    })
                ]).then(function () {
                    console.log(`playing ${track.name} will finish in ${track.duration_ms} miliseconds`)

                    spotifyQueue.queue = spotifyQueue.queue.slice(1, spotifyQueue.queue.length)
                    spotifyQueue.currentPlayNumber = spotifyQueue.currentPlayNumber + 1
                    const thisPlayNumber = spotifyQueue.currentPlayNumber
                    spotifyQueue.currentTrack = track
                    spotifyQueue.active = true

                    setTimeout(function () {
                        spotifyQueue.checkIfTrackEnded(thisPlayNumber, track)
                    }, track.duration_ms)

                    resolve(track.name)
                }).catch(function (error) {
                    // TODO: Handle attempting to play a bad track
                    console.error(error)
                    reject('Play request failed, ensure a device is online.')
                })
            }).catch(function (error) {
                console.error(error)
                reject('Failed to authenticate.')
            })
        })
    }
}