const MAX_ARTISTS = 3;

export default function getSpotifyObjectName(
    object: SpotifyApi.TrackObjectSimplified | SpotifyApi.AlbumObjectSimplified
): string {
    let artistsString;
    if (object.artists && object.artists.length > 0) {
        artistsString = "";
        for (let i = 0; i < Math.min(object.artists.length, MAX_ARTISTS); i++) {
            const artistObject = object.artists[i];
            const artistName = artistObject.name;
            if (artistsString !== "") {
                artistsString = artistsString + ", " + artistName;
            } else {
                artistsString = artistName;
            }
        }
    } else {
        artistsString = "Unknown";
    }

    return `${object.name} by ${artistsString}`;
}
