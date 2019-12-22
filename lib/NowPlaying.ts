// Provides a human readable status update

import prettyMilliseconds from "pretty-ms";
import { Queue, IQueueEntry } from "./Queue";

function getEntryString(entry: IQueueEntry): string {
    const timeString = prettyMilliseconds(entry.durationMs, {
        secondsDecimalDigits: 0
    });
    return `${entry.name} - ${timeString} (<@${entry.creatorId}>)`;
}

export class NowPlaying {
    private queue: Queue;

    constructor(queue: Queue) {
        this.queue = queue;
    }

    public get() {
        const isPlaying = this.queue.isPlaying();
        const currentEntry = this.queue.getCurrentEntry();
        const queue = this.queue.getQueue();

        let outputString = `*${isPlaying ? "Now Playing:" : "Paused:"}* ${
            currentEntry ? getEntryString(currentEntry) : "Nothing"
        }\n*Queue:*`;

        const shortQueue = queue.slice(0, 10);
        for (const [index, entry] of Object.entries(shortQueue)) {
            outputString += `\n${+index + 1}: ${getEntryString(entry)}`;
        }

        const tracksLeft = queue.length - shortQueue.length;
        if (tracksLeft > 0) {
            outputString += `\n+${tracksLeft} more`;
        }

        return outputString;
    }
}
