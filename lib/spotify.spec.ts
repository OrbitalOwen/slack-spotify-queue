import SpotifyWebApi from "spotify-web-api-node";
import openUrl from "open";
import { mocked } from "ts-jest/utils";
import Config from "./config";
import getSpotifyObjectName from "./getSpotifyObjectName";
import Spotify from "./spotify";

jest.mock("./config");
jest.mock("spotify-web-api-node");
jest.mock("open");

jest.useFakeTimers();

const mockedSpotifyWebApi = mocked(SpotifyWebApi, true);
const mockedConfig = mocked(Config, true);
const mockedOpenUrl = mocked(openUrl, true);

function getArtist(name: string): SpotifyApi.ArtistObjectSimplified {
    return {
        external_urls: {
            spotify: ""
        },
        href: "",
        id: "",
        name,
        type: "artist",
        uri: ""
    };
}

function getTrack(name: string, id: string): SpotifyApi.TrackObjectSimplified {
    return {
        artists: [],
        disc_number: 1,
        duration_ms: 1,
        explicit: false,
        external_urls: {
            spotify: ""
        },
        href: "",
        id,
        name,
        preview_url: "",
        track_number: 1,
        type: "track",
        uri: ""
    };
}

function mockSpotifyAuthResponse(accessToken: string, refreshToken: string, expiresIn: number) {
    const response = {
        body: {
            access_token: accessToken,
            expires_in: expiresIn,
            refresh_token: refreshToken,
            scope: "",
            token_type: ""
        },
        query: {
            code: expiresIn
        },
        headers: {},
        statusCode: 200
    };
    mockedSpotifyWebApi.prototype.authorizationCodeGrant.mockResolvedValue(response);
    mockedSpotifyWebApi.prototype.refreshAccessToken.mockResolvedValue(response);
}

function mockSpotifyDeviceResponse(devices) {
    const myDeviceResponse = {
        body: {
            devices
        },
        headers: {},
        statusCode: 200
    };
    mockedSpotifyWebApi.prototype.getMyDevices.mockResolvedValue(myDeviceResponse);
}

function mockSpotifyPlaybackResponse(item: object, isPlaying: boolean, progressMs: number) {
    const playbackResponse = {
        body: {
            item,
            is_playing: isPlaying,
            progress_ms: progressMs
        },
        headers: {},
        statusCode: 200
    };
    // @ts-ignore The actual response is huge, and we only care about the above data
    mockedSpotifyWebApi.prototype.getMyCurrentPlayingTrack.mockResolvedValue(playbackResponse);
}

function mockSearchResults(tracks, albums) {
    const searchResults = {
        body: {
            tracks: {
                items: tracks
            },
            albums: {
                items: albums
            }
        },
        headers: {},
        statusCode: 200
    };
    // @ts-ignore The actual response is huge, and we only care about the above data
    mockedSpotifyWebApi.prototype.search.mockResolvedValue(searchResults);
}

function setupConfigMock(accessToken: string, refreshToken: string, searchLimit: number) {
    mockedConfig.prototype.get.mockReturnValue({
        SPOTIFY_CLIENT_ID: "VALID_SPOTIFY_CLIENT_ID",
        SPOTIFY_CLIENT_SECRET: "VALID_SPOTIFY_CLIENT_SECRET",
        SLACK_BOT_TOKEN: "",
        SKIP_THRESHOLD: 1,
        DEFAULT_TRACK_LIMIT: 100,
        AUTH_PORT: 8080,
        BROADCAST_CHANNEL: "",
        VOLUME_DELTA: 10,
        SEARCH_RESULTS_LIFETIME: 43200000,
        OPTION_EMOJIS: ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine"],
        SPOTIFY_ACCESS_TOKEN: accessToken,
        SPOTIFY_REFRESH_TOKEN: refreshToken,
        SEARCH_LIMIT: searchLimit
    });
}

function setupSpotifyApiMock() {
    setupConfigMock(null, null, 1);
    mockSpotifyDeviceResponse([{ id: "VALID_DEVICE_ID", is_restricted: false }]);
    mockSpotifyAuthResponse("VALID_ACCESS_TOKEN", "VALID_REFRESH_TOKEN", 1);
    mockSpotifyPlaybackResponse({ id: "track_id" }, true, 0);
    mockSearchResults([], []);
    mockedSpotifyWebApi.prototype.setRepeat.mockResolvedValue(null);
    mockedSpotifyWebApi.prototype.setVolume.mockResolvedValue(null);
    mockedSpotifyWebApi.prototype.transferMyPlayback.mockResolvedValue(null);
    mockedSpotifyWebApi.prototype.setVolume.mockResolvedValue(null);
    mockedSpotifyWebApi.prototype.play.mockResolvedValue(null);
}

function resultsHasTrackObject(results, trackObject) {
    const result = results.find((object) => {
        if (object.id === trackObject.id && object.name === trackObject.name && object.type === trackObject.type) {
            return true;
        }
    });
    return result ? true : false;
}

function validateAuthenticatesWhen(func: (spotify: any) => void) {
    test("Should refresh the access token if expired", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();
        mockSpotifyAuthResponse("DIFFERENT_ACCESS_TOKEN", "VALID_REFRESH_TOKEN", 1000);
        jest.advanceTimersByTime(10);
        await func(spotify);
        expect(mockedSpotifyWebApi.prototype.setAccessToken).toHaveBeenLastCalledWith("DIFFERENT_ACCESS_TOKEN");
    });

    test("Should not refresh the access token if not expired", async () => {
        mockSpotifyAuthResponse("VALID_ACCESS_TOKEN", "VALID_REFRESH_TOKEN", 1000);
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();
        mockSpotifyAuthResponse("DIFFERENT_ACCESS_TOKEN", "VALID_REFRESH_TOKEN", 1000);
        await func(spotify);
        expect(mockedSpotifyWebApi.prototype.setAccessToken).toHaveBeenLastCalledWith("VALID_ACCESS_TOKEN");
    });
}

beforeEach(() => {
    mockedOpenUrl.mockResolvedValue(null);
    setupSpotifyApiMock();
});

afterEach(() => {
    jest.resetAllMocks();
});

describe("new Spotify()", () => {
    test("A SpotifyWebApi object should be created with the correct credentials", () => {
        const config = new Config();
        const spotify = new Spotify(config);
        expect(mockedSpotifyWebApi).toHaveBeenCalled();

        const configData = config.get();
        expect(mockedSpotifyWebApi.mock.calls[0][0]).toEqual({
            redirectUri: `http://localhost:${configData.AUTH_PORT}/callback`,
            clientId: configData.SPOTIFY_CLIENT_ID,
            clientSecret: configData.SPOTIFY_CLIENT_SECRET
        });
    });
});

describe("Spotify.authorize()", () => {
    test("When manually authenticating, should open an authentication URL with the correct scopes", async () => {
        mockedSpotifyWebApi.prototype.createAuthorizeURL.mockReturnValue("AUTH_URL");
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();

        expect(mockedSpotifyWebApi.prototype.createAuthorizeURL.mock.calls[0][0]).toEqual([
            "user-read-playback-state",
            "user-read-currently-playing",
            "user-modify-playback-state"
        ]);
        expect(mockedOpenUrl).toHaveBeenCalledWith("AUTH_URL");
    });

    test("When manually authenticating, the spotify access and refresh tokens should be used", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();

        expect(mockedSpotifyWebApi.prototype.setAccessToken).toBeCalledWith("VALID_ACCESS_TOKEN");
        expect(mockedSpotifyWebApi.prototype.setRefreshToken).toBeCalledWith("VALID_REFRESH_TOKEN");
    });

    test("When manually authenticating, the spotify access and refresh tokens should be saved", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();

        expect(mockedConfig.prototype.write).toBeCalledWith("SPOTIFY_ACCESS_TOKEN", "VALID_ACCESS_TOKEN");
        expect(mockedConfig.prototype.write).toBeCalledWith("SPOTIFY_REFRESH_TOKEN", "VALID_REFRESH_TOKEN");
    });

    test("If spotify access and refresh tokens are present in config, they should be used", async () => {
        setupConfigMock("VALID_ACCESS_TOKEN", "VALID_REFRESH_TOKEN", 3);

        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.authorize();

        expect(mockedSpotifyWebApi.prototype.authorizationCodeGrant).toBeCalledTimes(0);
        expect(mockedSpotifyWebApi.prototype.setAccessToken).toBeCalledWith("VALID_ACCESS_TOKEN");
        expect(mockedSpotifyWebApi.prototype.setRefreshToken).toBeCalledWith("VALID_REFRESH_TOKEN");
    });
});

describe("Spotify.setDeviceId()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.setDeviceId("VALID_DEVICE_ID");
    });

    test("Should transfer playback if a valid, unrestricted deviceId is given", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");

        expect(mockedSpotifyWebApi.prototype.transferMyPlayback.mock.calls[0][0]).toEqual({
            device_ids: ["VALID_DEVICE_ID"],
            play: false
        });
    });

    test("Should reject with an error if an invalid deviceId is given", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await expect(spotify.setDeviceId("INVALID_DEVICE_ID")).rejects.toEqual(expect.any(Error));
    });

    test("Should reject with an error if a restricted deviceId is given", async () => {
        mockSpotifyDeviceResponse([{ id: "VALID_DEVICE_ID", is_restricted: true }]);
        const config = new Config();
        const spotify = new Spotify(config);
        await expect(spotify.setDeviceId("VALID_DEVICE_ID")).rejects.toEqual(expect.any(Error));
    });
});

describe("Spotify.setVolume()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.setVolume(100);
    });

    test("Should set the volume, with the correct deviceId", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");
        await spotify.setVolume(37);

        expect(mockedSpotifyWebApi.prototype.setVolume.mock.calls[0][0]).toBe(37);
        expect(mockedSpotifyWebApi.prototype.setVolume.mock.calls[0][1]).toEqual({
            device_id: "VALID_DEVICE_ID"
        });
    });
});

describe("Spotify.play()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.play("spotify_uri");
    });

    test("Should set setRepeat to false, with the correct deviceId", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");
        await spotify.play("spotify_uri");

        expect(mockedSpotifyWebApi.prototype.setRepeat.mock.calls[0][0]).toEqual({
            device_id: "VALID_DEVICE_ID",
            state: "off"
        });
    });

    test("Should set setVolume to the current volume, with the correct deviceId", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");
        await spotify.setVolume(71);
        mockedSpotifyWebApi.prototype.setVolume.mockClear();
        await spotify.play("spotify_uri");

        expect(mockedSpotifyWebApi.prototype.setVolume.mock.calls[0][0]).toBe(71);
        expect(mockedSpotifyWebApi.prototype.setVolume.mock.calls[0][1]).toEqual({
            device_id: "VALID_DEVICE_ID"
        });
    });

    test("Should call play with the correct uri, deviceId and positionMs", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");
        await spotify.play("spotify_uri", 101);

        expect(mockedSpotifyWebApi.prototype.play.mock.calls[0][0]).toEqual({
            device_id: "VALID_DEVICE_ID",
            uris: ["spotify_uri"],
            position_ms: 101
        });
    });
});

describe("Spotify.pause()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.pause();
    });

    test("Should pause, with the correct deviceId", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.setDeviceId("VALID_DEVICE_ID");
        await spotify.pause();

        expect(mockedSpotifyWebApi.prototype.pause.mock.calls[0][0]).toEqual({
            device_id: "VALID_DEVICE_ID"
        });
    });
});

describe("Spotify.getPlaybackInfo()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.getPlaybackInfo();
    });

    test("Should return the correct trackId and isPlaying status", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        mockSpotifyPlaybackResponse({ id: "track_id" }, true, null);
        const playbackInfo = await spotify.getPlaybackInfo();
        expect(playbackInfo.trackId).toBe("track_id");
        expect(playbackInfo.isPlaying).toBe(true);
    });

    test("Should return the correct trackId, isPlaying and progressMs values", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        mockSpotifyPlaybackResponse({ id: "track_id" }, true, 137);
        const playbackInfo = await spotify.getPlaybackInfo();
        expect(playbackInfo.trackId).toBe("track_id");
        expect(playbackInfo.isPlaying).toBe(true);
        expect(playbackInfo.progressMs).toBe(137);
    });

    test("Should return no trackId if non track is returned", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        mockSpotifyPlaybackResponse(null, true, 137);
        const playbackInfo = await spotify.getPlaybackInfo();
        expect(playbackInfo.trackId).toBe(null);
    });
});

describe("Spotify.getAvailableDeviceIds()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.getAvailableDeviceIds();
    });

    test("Should return an array of unrestricted deviceIds", async () => {
        const config = new Config();
        const spotify = new Spotify(config);
        mockSpotifyDeviceResponse([
            { id: "VALID_DEVICE_ID_1", is_restricted: false },
            { id: "VALID_DEVICE_ID_2", is_restricted: false },
            { id: "RESTRICTED_DEVICE_ID", is_restricted: true }
        ]);
        const devices = await spotify.getAvailableDeviceIds();
        expect(devices.includes("VALID_DEVICE_ID_1")).toBe(true);
        expect(devices.includes("VALID_DEVICE_ID_2")).toBe(true);
        expect(devices.includes("RESTRICTED_DEVICE_ID")).toBe(false);
    });
});

describe("Spotify.search()", () => {
    validateAuthenticatesWhen(async (spotify) => {
        await spotify.search("");
    });

    test("Should call search with the valid query, scopes and limit", async () => {
        setupConfigMock(null, null, 3);

        const config = new Config();
        const spotify = new Spotify(config);
        await spotify.search("my_query");
        expect(mockedSpotifyWebApi.prototype.search.mock.calls[0][0]).toBe("my_query");
        expect(mockedSpotifyWebApi.prototype.search.mock.calls[0][1]).toEqual(["album", "track"]);
        expect(mockedSpotifyWebApi.prototype.search.mock.calls[0][2]).toEqual({ limit: 3 });
    });

    test("Should process the search result names correctly", async () => {
        const config = new Config();
        const spotify = new Spotify(config);

        const track1 = getTrack("White Noise", "track_id_1");
        track1.artists = [getArtist("Amy")];
        const track2 = getTrack("Loud Screaming", "track_id_2");
        track2.artists = [getArtist("Zoe")];

        const album1 = getTrack("Collection of SFX", "album_id_1");
        album1.artists = [getArtist("Joseph")];
        const album2 = getTrack("A good book", "album_id_2");
        album2.artists = [getArtist("Peter")];

        mockSearchResults([track1, track2], [album1, album2]);

        const results = await spotify.search("");
        expect(
            resultsHasTrackObject(results, {
                name: getSpotifyObjectName(track1),
                type: "track",
                id: "track_id_1"
            })
        ).toBe(true);
        expect(
            resultsHasTrackObject(results, {
                name: getSpotifyObjectName(track2),
                type: "track",
                id: "track_id_2"
            })
        ).toBe(true);
        expect(
            resultsHasTrackObject(results, {
                name: getSpotifyObjectName(album1),
                type: "album",
                id: "album_id_1"
            })
        ).toBe(true);
        expect(
            resultsHasTrackObject(results, {
                name: getSpotifyObjectName(album2),
                type: "album",
                id: "album_id_2"
            })
        ).toBe(true);
    });
});
