This project is still in production and is not stable yet.

## Setup

Create a `config.json` file in the project's directory, with the following template:

```js
{
    "SPOTIFY_CLIENT_ID": "", // Create app on https://developer.spotify.com and retieve from dashboard
    "SPOTIFY_CLIENT_SECRET": "", // Create app on https://developer.spotify.com and retieve from dashboard
    "SLACK_BOT_TOKEN": "", // Create an app on `https://api.slack.com/apps/`, include a bot user, add to your workplace and retrieve the `Bot User OAuth Access Token` under `OAuth & Permissions`
    "SKIP_THRESHOLD": 3, // The number of skip votes required before a song is skipped
    "DEFAULT_TRACK_LIMIT": 100, // The default number of tracks to be added from a playlist or album (max is 100)
    "AUTH_PORT": 8080, // The port to use for spotify's authentication flow. Ensure the URL http://localhost:AUTH_PORT/callback is whitelisted on your spotify app
    "BROADCAST_CHANNEL": "", // Optional, channel id 'broadcast' level messages are sent to, otherwise they are DM'd to the command sender
    "SPOTIFY_ACCESS_TOKEN": null, // Optional, saved access token to prevent the need to authenticate through a browser
    "SPOTIFY_REFRESH_TOKEN": null, // Optional, saved access token to prevent the need to authenticate through a browser
}
```

Install dependencies using `npm install`

## Running

-   Run using `npm start`
-   Unless, `SPOTIFY_ACCESS_TOKEN` and `SPOTIFY_REFRESH_TOKEN` are manually set in `config.json`, a web browser window will open asking you to authenticate with Spotify. Once authenticated these values will be automatically written to `config.json`.
-   Invite the bot to the channel they will broadcast from (if applicable) and DM commands to the bot (use `help` for more info)

## TODO

-   Code cleanup
-   `add` by track name using Spotify's search API
-   Testing to see if it actually works
