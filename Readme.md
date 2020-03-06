# Slack Spotify Queue

**WARNING: This project is still in production and is not stable yet.**

An app that allows a Spotify queue to be played and manipulated from slack. Allows coworkers to collaboratively control the music. Includes a queueing functionality, along with skip votes.

This app can be ran on a computer or deployed to a server. Any Spotify player can be used to output the music, provided it can be manipulated via web commands. There is no requirement that the spotify app is running on the same machine as this app.

For a quick setup in an office, use a spare laptop plugged into your office's speakers. Download and log into Spotify, then open the Spotify app. Next, download this project, [set it up](setup), create the [config file](#config-file) and [run the app](#running).

## Setup

-   Install [nodejs](https://nodejs.org/en/download/)
-   Install dependencies using `npm install`
-   Build project using `npm run build`
-   Create a `config.json` file in this project's directory in the following format:

## Config File

```js
{
    // Create an app on https://developer.spotify.com and retrieve these values from the dashboard
    "SPOTIFY_CLIENT_ID": "",
    "SPOTIFY_CLIENT_SECRET": "",

    // These are set by the app when manually authenticating. If you want to skip the manual authentication flow, you should set these manually.
    "SPOTIFY_ACCESS_TOKEN": null,
    "SPOTIFY_REFRESH_TOKEN": null,

    // Create an app on `https://api.slack.com/apps`, include a bot user, add to your workplace and retrieve the `Bot User OAuth Access Token` under `OAuth & Permissions`
    "SLACK_BOT_TOKEN": "",

    // The number of skip votes required to skip a vote
    "SKIP_THRESHOLD": 1,

    // The default maxTracks parameter used by the add command
    "DEFAULT_TRACK_LIMIT": 10,

    // The port to use for the manual authentication flow
    "AUTH_PORT": 8080,

    // The channel id to broadcast key messages to. This can be retrieved from slack's browser client by selecting the channel and taking the final part of the URL
    "BROADCAST_CHANNEL": null

    // The default and max volume increments to be used by the volume command
    "DEFAULT_VOLUME_DELTA": 10,
    "MAX_VOLUME_DELTA": 20,

    // The emojis to be used for responding to the search and device commands
    "OPTION_EMOJIS": ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "zero"],

    // The maximum number of albums or tracks to display when using the search command
    "SEARCH_LIMIT": 3,

    // When true, the app will automatically pick a suitable device to play from on startup. When false, a device will need to be selected using the devices command.
    "AUTO_SELECT_DEVICE": true
}
```

## Running

-   Start the app using `npm start`
-   Unless, `SPOTIFY_ACCESS_TOKEN` and `SPOTIFY_REFRESH_TOKEN` are manually set in `config.json`, a web browser window will open asking you to authenticate with Spotify. Once authenticated these values will be automatically written to `config.json`.
-   Invite the bot to the channel they will broadcast from (if applicable) and DM commands to the bot (use `help` for more info)

## Running as a background process

You may wish to run this app as a daemon process. The easiest way to do this is using `pm2` and running `pm2 start node -- index.js`.

## Caveats

-   This was developed for internal use. It is still in development and not stable. Whilst this is the case, it's not suitable for use.
