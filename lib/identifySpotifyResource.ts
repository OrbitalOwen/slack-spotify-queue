const URL_PREFIXES = ["http://", "https://"];
const URL_START = "open.spotify.com/";
const URI_START = "spotify:";

export interface IResource {
    type: "track" | "album" | "playlist";
    id: string;
}

function removeUrlPrefix(input: string): string {
    for (const prefix of URL_PREFIXES) {
        input = input.replace(prefix, "");
    }
    return input;
}

function removeSlackTags(input: string): string {
    input = input.replace("<", "");
    input = input.replace(">", "");
    return input;
}

function identifySpotifyResource(rawInputString: string): IResource | undefined {
    let inputString = rawInputString.trim();

    inputString = removeSlackTags(inputString);
    inputString = removeUrlPrefix(inputString);

    const isUrl = inputString.startsWith(URL_START);
    const isUri = inputString.startsWith(URI_START);

    if (isUrl || isUri) {
        const start = isUrl ? URL_START : URI_START;
        const divider = isUrl ? "/" : ":";
        const components = inputString.substring(start.length, inputString.length).split(divider);
        const type = components[0];
        const id = components[1];

        if (type && id) {
            if (type === "track" || type === "playlist" || type === "album") {
                const resource: IResource = {
                    id,
                    type
                };
                return resource;
            }
        }
    }
}

export default identifySpotifyResource;
