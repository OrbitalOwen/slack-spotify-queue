import { Votes } from "./votes";
import { Config } from "./config";
import { Queue } from "./queue";
import { Spotify } from "./spotify";
import { mocked } from "ts-jest/utils";
import { AssertionError } from "assert";

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
    test("Should read the threshold from the given config", () => {
        const votes = makeVotes();
        expect((votes as any).threshold).toBe(3);
    });
});

describe("Votes.canVoteOnTrack()", () => {
    test("Should return true if no vote exists yet", () => {
        const votes = makeVotes();
        const canVote = votes.canVoteOnTrack("user_id", 1);
        expect(canVote).toBe(true);
    });

    test("If a vote exists, should only return true if the user has not already voted", () => {
        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: [] }];
        expect(votes.canVoteOnTrack("user_id", 1)).toBe(true);
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];
        expect(votes.canVoteOnTrack("user_id", 1)).toBe(false);
    });
});

describe("Votes.voteOnTracks()", () => {
    test("Should return an array of votes participated in", async () => {
        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: [] }];
        const votesParticipated = await votes.voteOnTracks("user_id", [1, 2]);
        expect(votesParticipated).toEqual([
            { queueId: 1, usersFor: ["user_id"] },
            { queueId: 2, usersFor: ["user_id"] }
        ]);
    });

    test("Should register a passing vote as passed", async () => {
        const votes = makeVotes();
        (votes as any).threshold = 1;
        let votesParticipated = await votes.voteOnTracks("user_id", [1]);
        expect(votesParticipated[0].passed).toBe(true);
        (votes as any).threshold = 3;
        (votes as any).votes = [{ queueId: 1, usersFor: ["bob", "sarah"] }];
        votesParticipated = await votes.voteOnTracks("user_id", [1]);
        expect(votesParticipated[0].passed).toBe(true);
    });

    test("Should not allow a user to vote on a track twice", async () => {
        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];
        const votesParticipated = await votes.voteOnTracks("user_id", [1]);
        expect(votesParticipated.length).toBe(0);
        expect((votes as any).votes).toEqual([{ queueId: 1, usersFor: ["user_id"] }]);
    });

    test("Should remove a vote from the registry once passed", async () => {
        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["bob", "sarah"] }];
        await votes.voteOnTracks("user_id", [1]);
        expect((votes as any).votes.length).toBe(0);
    });

    test("Should call queue.removeTracks with any passing votes", async () => {
        const votes = makeVotes();
        (votes as any).votes = [
            { queueId: 1, usersFor: ["bob", "sarah"] },
            { queueId: 2, usersFor: ["bob", "sarah"] }
        ];
        await votes.voteOnTracks("user_id", [1, 2]);
        expect(mockedQueue.prototype.removeTracks).toHaveBeenCalledWith([1, 2]);
    });
});

describe("Votes.canVoteOnGroup()", () => {
    test("Should return true if canVoteOnTrack returns true for any track in the group", () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 }
        ]);
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];
        const canVote = votes.canVoteOnGroup("user_id", 1);
        expect(canVote).toBe(true);
    });

    test("Should return false if canVoteOnTrack does not return true for any track in the group", () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 2 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2 }
        ]);
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];
        const canVote = votes.canVoteOnGroup("user_id", 1);
        expect(canVote).toBe(false);
    });

    test("Should also check the current entry", () => {
        const votes = makeVotes();
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "",
            queueId: 1,
            groupId: 1
        });
        const canVote = votes.canVoteOnGroup("user_id", 1);
        expect(canVote).toBe(true);
    });
});

describe("Votes.voteOnGroup()", () => {
    test("Should call voteOnTracks with all tracks in the group", async () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2 }
        ]);
        const voteOnTrackSpy = jest.spyOn(votes, "voteOnTracks");
        await votes.voteOnGroup("user_id", 1);
        expect(voteOnTrackSpy).toHaveBeenCalledWith("user_id", [1, 2]);
    });

    test("Should return the vote results", async () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1 },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2 }
        ]);
        const results = await votes.voteOnGroup("user_id", 1);
        expect(results).toEqual([
            { queueId: 1, usersFor: ["user_id"] },
            { queueId: 2, usersFor: ["user_id"] }
        ]);
    });
});
