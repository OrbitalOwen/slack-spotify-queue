import { Votes } from "./Votes";
import { Config } from "./Config";
import { Queue } from "./Queue";
import { Spotify } from "./Spotify";
import { mocked } from "ts-jest/utils";

jest.mock("./Config");
jest.mock("./Queue");
jest.mock("./Spotify");

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

    test("Should allow the creator to skip their own track", async () => {
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "user_id", queueId: 1, groupId: 1, isPlayable: true }
        ]);
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "user_id",
            queueId: 2,
            groupId: 1,
            isPlayable: true
        });

        const votes = makeVotes();
        (votes as any).threshold = 3;
        const votesParticipated = await votes.voteOnTracks("user_id", [1, 2]);
        expect(votesParticipated[0].passed).toBe(true);
        expect(votesParticipated[1].passed).toBe(true);
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
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1, isPlayable: true }
        ]);
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];
        const canVote = votes.canVoteOnGroup("user_id", 1);
        expect(canVote).toBe(true);
    });

    test("Should return false if canVoteOnTrack does not return true for any track in the group", () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 2, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2, isPlayable: true }
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
            groupId: 1,
            isPlayable: true
        });
        const canVote = votes.canVoteOnGroup("user_id", 1);
        expect(canVote).toBe(true);
    });
});

describe("Votes.voteOnGroup()", () => {
    test("Should call voteOnTracks with all tracks in the group", async () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2, isPlayable: true }
        ]);
        const voteOnTrackSpy = jest.spyOn(votes, "voteOnTracks");
        await votes.voteOnGroup("user_id", 1);
        expect(voteOnTrackSpy).toHaveBeenCalledWith("user_id", [1, 2]);
    });

    test("Should return the vote results", async () => {
        const votes = makeVotes();
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 1, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 2, groupId: 1, isPlayable: true },
            { name: "", uri: "", durationMs: 0, creatorId: "", queueId: 3, groupId: 2, isPlayable: true }
        ]);
        const results = await votes.voteOnGroup("user_id", 1);
        expect(results).toEqual([
            { queueId: 1, usersFor: ["user_id"] },
            { queueId: 2, usersFor: ["user_id"] }
        ]);
    });
});

describe("Votes.skipCurrent()", () => {
    test("Should fail if there is no current entry", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue(undefined);

        const votes = makeVotes();
        const result = await votes.skipCurrent("user_id", false);

        expect(result.success).toBe(false);
    });

    test("Should fail if the user has already voted for this track", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });

        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];

        const result = await votes.skipCurrent("user_id", false);
        expect(result.success).toBe(false);
    });

    test("Should fail if the user has already voted for this group", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "peter", queueId: 2, groupId: 1, isPlayable: true }
        ]);

        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["user_id"] }];

        const result = await votes.skipCurrent("user_id", true);

        expect(result.success).toBe(false);
    });

    test("Should vote on the track", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });

        const votes = makeVotes();
        (votes as any).votes = [];

        const result = await votes.skipCurrent("user_id", false);

        expect(result.success).toBe(true);
        expect((votes as any).votes).toEqual([{ queueId: 1, usersFor: ["user_id"] }]);
    });

    test("Should vote on the group", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "peter", queueId: 2, groupId: 1, isPlayable: true }
        ]);

        const votes = makeVotes();
        const result = await votes.skipCurrent("user_id", true);

        expect(result.success).toBe(true);
        expect((votes as any).votes).toEqual([
            { queueId: 1, usersFor: ["user_id"] },
            { queueId: 2, usersFor: ["user_id"] }
        ]);
    });

    test("Should return a message if no votes passed on a group", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true,
            groupName: "groupName"
        });
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "peter", queueId: 2, groupId: 1, isPlayable: true }
        ]);

        const votes = makeVotes();
        const result = await votes.skipCurrent("user_id", true);

        expect(result.success).toBe(true);
        expect(result.message).toBe("<user_id> voted to skip 2 track(s) from groupName");
    });

    test("Should return a message if the vote did not pass on a track", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "trackName",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });

        const votes = makeVotes();
        (votes as any).votes = [];

        const result = await votes.skipCurrent("user_id", false);

        expect(result.success).toBe(true);
        expect(result.message).toBe("<user_id> voted to skip trackName");
    });

    test("Should return a message if some votes passed on a group", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true,
            groupName: "groupName"
        });
        mockedQueue.prototype.getQueue.mockReturnValue([
            { name: "", uri: "", durationMs: 0, creatorId: "peter", queueId: 2, groupId: 1, isPlayable: true }
        ]);

        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["user1", "user2"] }];
        const result = await votes.skipCurrent("user_id", true);

        expect(result.success).toBe(true);
        expect(result.message).toBe("<user_id> voted to skip 2 track(s) from groupName. Now skipping 1 track(s)");
    });

    test("Should return a message if the vote passed on a track", async () => {
        mockedQueue.prototype.getCurrentEntry.mockReturnValue({
            name: "trackName",
            uri: "",
            durationMs: 0,
            creatorId: "peter",
            queueId: 1,
            groupId: 1,
            isPlayable: true
        });

        const votes = makeVotes();
        (votes as any).votes = [{ queueId: 1, usersFor: ["user1", "user2"] }];

        const result = await votes.skipCurrent("user_id", false);

        expect(result.success).toBe(true);
        expect(result.message).toBe("<user_id> voted to skip trackName. Now skipping");
    });
});
