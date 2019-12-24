import getSpotifyObjectName from "./getSpotifyObjectName";

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

function getTrack(name: string): SpotifyApi.TrackObjectSimplified {
    return {
        artists: [],
        disc_number: 1,
        duration_ms: 1,
        explicit: false,
        external_urls: {
            spotify: ""
        },
        href: "",
        id: "",
        name,
        preview_url: "",
        track_number: 1,
        type: "track",
        uri: ""
    };
}

test("Should return 'Unknown' as artist name if no artist is present", () => {
    const track = getTrack("White Noise");
    expect(getSpotifyObjectName(track)).toBe("White Noise by Unknown");
});

test("Should show artist names in order", () => {
    const track = getTrack("White Noise");
    track.artists = [getArtist("Amy"), getArtist("Bobby"), getArtist("Clara")];
    expect(getSpotifyObjectName(track)).toBe("White Noise by Amy, Bobby, Clara");
});

test("Should show no more than 3 artists", () => {
    const track = getTrack("White Noise");
    track.artists = Array(50).fill(getArtist("John"));
    expect(getSpotifyObjectName(track)).toBe("White Noise by John, John, John");
});
