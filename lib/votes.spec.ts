import { Votes } from "./votes";
import { Config } from "./config";
import { Queue } from "./queue";
import { Spotify } from "./spotify";
import { mocked } from "ts-jest/utils";

jest.mock("./config");
jest.mock("./queue");
jest.mock("./spotify");

const mockedQueue = mocked(Queue, true);
const mockedConfig = mocked(Config, true);

function makeVotes() {
    const config = new Config();
    const spotify = new Spotify(config);
    const queue = new Queue(config, spotify);
    return new Votes(config, queue);
}

beforeEach(() => {
    (mockedConfig as any).prototype.get.mockReturnValue({ SKIP_THRESHOLD: 3 });
    mockedQueue.prototype.getCurrentEntry.mockReturnValue(undefined);
    mockedQueue.prototype.getQueue.mockReturnValue([]);
    mockedQueue.prototype.removeTracks.mockResolvedValue(null);
});

afterEach(() => {
    jest.resetAllMocks();
});

describe("Votes.new()", () => {
    test.todo("Should read the threshold from the given config");
});

describe("Votes.canVoteOnTrack()", () => {
    test.todo("Should return true if no vote exists yet");
    test.todo("If a vote exists, should only return true if the user has not already voted");
});

describe("Votes.voteOnTracks()", () => {
    test.todo("Should return an array of votes participated in");
    test.todo("Should use existing votes where possible");
    test.todo("Should not allow a user to vote on a track twice");
    test.todo("Should register a passing vote as passed");
    test.todo("Should remove a vote from the registry once passed");
    test.todo("Should call queue.removeTracks with any passing votes");
});

describe("Votes.canVoteOnGroup()", () => {
    test.todo("Should return true if canVoteOnTrack returns true for any track in the group");
});

describe("Votes.voteOnGroup()", () => {
    test.todo("Should call voteOnTracks with all tracks in the group");
    test.todo("Should return the value voteOnTracks returns");
});
