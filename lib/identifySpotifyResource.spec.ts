import { identifySpotifyResource } from "./identifySpotifyResource";

test("Should identify URL resources correctly", () => {
    expect(identifySpotifyResource("open.spotify.com/track/1234")).toEqual({
        type: "track",
        id: "1234"
    });
});

test("Should work with URLs with both http and https prefixes", () => {
    expect(identifySpotifyResource("https://open.spotify.com/track/1234")).toEqual({
        type: "track",
        id: "1234"
    });
    expect(identifySpotifyResource("http://open.spotify.com/track/1234")).toEqual({
        type: "track",
        id: "1234"
    });
});

test("Should identify URI resources correctly", () => {
    expect(identifySpotifyResource("spotify:track:1234")).toEqual({
        type: "track",
        id: "1234"
    });
});

test("Should identify track, album and playlist resource types", () => {
    expect(identifySpotifyResource("spotify:track:1234")).toEqual({
        type: "track",
        id: "1234"
    });
    expect(identifySpotifyResource("spotify:album:1234")).toEqual({
        type: "album",
        id: "1234"
    });
    expect(identifySpotifyResource("spotify:playlist:1234")).toEqual({
        type: "playlist",
        id: "1234"
    });
});

test("Should ignore <> characters", () => {
    expect(identifySpotifyResource("<spotify:track:1234>")).toEqual({
        type: "track",
        id: "1234"
    });
});

test("Should return undefined for an invalid string", () => {
    expect(identifySpotifyResource("pint of milk")).toBe(undefined);
});

test("Should return undefined for an invalid resource type", () => {
    expect(identifySpotifyResource("spotify:book:1234")).toBe(undefined);
    expect(identifySpotifyResource("open.spotify.com/book/1234")).toBe(undefined);
});

test("Should return undefined for malformed resources", () => {
    expect(identifySpotifyResource("spotify:track:")).toBe(undefined);
    expect(identifySpotifyResource("open.spotify.com/track/")).toBe(undefined);
    expect(identifySpotifyResource("spotify:track")).toBe(undefined);
    expect(identifySpotifyResource("open.spotify.com/track")).toBe(undefined);
});
