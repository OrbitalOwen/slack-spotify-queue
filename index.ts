require('dotenv').config()

import SlackBot from './lib/slackBot'
import SpotifyQueue from './lib/spotifyQueue'

let queue = new SpotifyQueue
let bot = new SlackBot(queue)

queue.authorize().then(function() {
    console.log('Spotify authorized, listening for slack messages')
    bot.listenForMessages()
}).catch(function(error) {
    console.error(error)
    console.error('Failed to authorize Spotify')
})
