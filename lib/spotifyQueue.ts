import * as SpotifyWebApi from 'spotify-web-api-node'
import * as express from 'express'
import * as openUrl from 'open'

const scopes = [
    'user-read-playback-state',
    'user-read-currently-playing',
    'user-modify-playback-state',
]

const spotifyApi = new SpotifyWebApi({
    redirectUri: 'http://localhost:8800/callback',
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

function getObjectName(objectInfo): string {
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

    authorize() {
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

            expressServer = expressApp.listen(8800)

            const authorizeURL = spotifyApi.createAuthorizeURL(scopes)
            openUrl(authorizeURL)
        })
    };

    private refershTokenIfRequired() {
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


    getQueueString(): string {
        if (this.queue.length == 0) {
            return 'Queue empty'
        }

        let queueString = 'Queue is:'

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

    private createTrackEntry(trackInfo): Track {
        const name = getObjectName(trackInfo)
        const duration_ms = trackInfo.duration_ms

        let uri = trackInfo.uri
        let trackId = trackInfo.trackId

        const track: Track = {
            name,
            duration_ms,
            uri,
            trackId
        }

        return track
    }

    getCurrentTrackName(): string {
        if (this.active) {
            return this.currentTrack.name
        }
    }

    private addSeveralTracksToQueue(tracks) {
        let spotifyQueue = this
        for (const trackInfo of tracks) {
            const track = spotifyQueue.createTrackEntry(trackInfo)
            spotifyQueue.queue.push(track)
        }
        if (spotifyQueue.active && spotifyQueue.queue.length == 1) {
            spotifyQueue.playNextTrack().catch(function(error) {
                console.error(error)
            })
        }
    }

    addAlbumToQueue(albumId: string) {
        const spotifyQueue = this
        return new Promise(function(resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function() {
                return spotifyApi.getAlbum(albumId).then(function(response) {
                    let albumName = getObjectName(response.body)
                    let tracks = response.body.tracks.items
                    spotifyQueue.addSeveralTracksToQueue(tracks)
                    resolve(`${tracks.length} tracks from album ${albumName}`)
                })
            }).catch(function(error) {
                console.error(error)
                reject('Could not add album tracks ')
            })
        })
    }

    addPlaylistToQueue(playlistId: string) {
        const spotifyQueue = this
        return new Promise(function(resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function() {
                return spotifyApi.getPlaylist(playlistId).then(function(response) {
                    let playlistName = response.body.name
                    let tracks = response.body.tracks.items
                    tracks = tracks.map(function(playlistTrack) {
                        return playlistTrack.track
                    })
                    spotifyQueue.addSeveralTracksToQueue(tracks)
                    resolve(`${tracks.length} tracks from playlist ${playlistName}`)

                })
            }).catch(function(error) {
                console.error(error)
                reject('Could not add playlist tracks')
            })
        })
    }

    addTrackToQueue(trackId: string) {
        const spotifyQueue = this
        return new Promise(function (resolve, reject) {
            spotifyQueue.refershTokenIfRequired().then(function () {
                return spotifyApi.getTrack(trackId)
            }).then(function (response) {
                const track = spotifyQueue.createTrackEntry(response.body)

                spotifyQueue.queue.push(track)

                if (spotifyQueue.active && spotifyQueue.queue.length == 1) {
                    spotifyQueue.playNextTrack().catch(function(error) {
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

    private checkIfTrackEnded(thisPlayNumber: number, track: Track) {
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
                spotifyQueue.playNextTrack().catch(function(error) {
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
        }).catch(function(error) {
            error.console.error(error)
            console.error('Failed to assess playback state, retrying in 2 seconds')
            setTimeout(function() {
                spotifyQueue.checkIfTrackEnded(thisPlayNumber, track)
            }, 2000)
        })
    }

    stop() {
        const spotifyQueue = this

        return new Promise(function(resolve, reject) {
            return spotifyQueue.refershTokenIfRequired().then(function() {
                return spotifyApi.pause({})
            }).then(function() {
                spotifyQueue.active = false
                resolve()
            }).catch(function(error) {
                console.error(error)
                reject('Stop request failed, ensure a device is online.')
            })
        })
    }

    getCurrentTrack() {

    }

    playNextTrack() {
        const spotifyQueue = this
        return new Promise(function(resolve, reject) {
            if (spotifyQueue.queue.length == 0) {
                reject('Queue is empty.')
                return
            }

            const track = spotifyQueue.queue[0]

            return spotifyQueue.refershTokenIfRequired().then(function() {
                return Promise.all([
                    spotifyApi.setRepeat({
                        state: 'off'
                    }),
                    spotifyApi.play({
                        uris: [track.uri]
                    })
                ]).then(function() {
                    console.log(`playing ${track.name} will finish in ${track.duration_ms} miliseconds`)

                    spotifyQueue.queue = spotifyQueue.queue.slice(1, spotifyQueue.queue.length)
                    spotifyQueue.currentPlayNumber = spotifyQueue.currentPlayNumber + 1
                    const thisPlayNumer = spotifyQueue.currentPlayNumber
                    spotifyQueue.currentTrack = track
                    spotifyQueue.active = true

                    setTimeout(function () {
                        spotifyQueue.checkIfTrackEnded(thisPlayNumer, track)
                    }, track.duration_ms)

                    resolve(track.name)
                }).catch(function(error) {
                    console.error(error)
                    reject('Play request failed, ensure a device is online.')
                })
            }).catch(function(error) {
                console.error(error)
                reject('Failed to authenticate.')
            })
        })
    }
}