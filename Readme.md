## Setup

Create a `.env` file in this project's directory with the following information:

`SPOTIFY_CLIENT_ID` - Create an app on `https://developer.spotify.com` and retrieve from dashboard
`SPOTIFY_CLIENT_SECRET` - Create an app on `https://developer.spotify.com` and retrieve from dashboard
`SLACK_BOT_TOKEN` - Create an app on `https://api.slack.com/apps/`, include a bot user, add to your workplace and retrieve the `Bot User OAuth Access Token` under `OAuth & Permissions`
`BOT_USER_ID` - Open slack in a browser, go to send the bot a direct message and extract the ID from the end of the URL
`SKIP_THRESHOLD` - The number of skip votes required before a song is skipped

Install dependencies using `npm install`

## Running

Run using `npm start`
A web browser window will open asking you to authenticate with spotify
Begin playing spotify on the device you wish to output from
Invite the bot to a channel and view commands using `@bot help` 

## TODO

- Code cleanup
- `add` by track name using Spotify's search API
- More robust device selection
- Testing to see if it actually works 

