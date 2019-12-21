import { AwaitSignal } from "./AwaitSignal";

test("Should call connected callbacks when firing", async () => {
    const signal = new AwaitSignal<[]>();

    let called = false;

    const callback = async () => {
        await Promise.resolve();
        called = true;
    };

    signal.connect(callback);

    await signal.fire();

    expect(called).toBe(true);
});

test("Should pass arguments through correctly", async () => {
    const signal = new AwaitSignal<[string, number]>();

    let calledStringArg: string;
    let calledNumArg: number;

    const callback = async (stringArg: string, numArg: number) => {
        await Promise.resolve();
        calledStringArg = stringArg;
        calledNumArg = numArg;
    };

    signal.connect(callback);

    await signal.fire("hello", 99);

    expect(calledStringArg).toBe("hello");
    expect(calledNumArg).toBe(99);
});

test("Should disconnect correctly", async () => {
    const signal = new AwaitSignal<[]>();

    let called = false;

    const callback = async () => {
        await Promise.resolve();
        called = true;
    };

    const connection = signal.connect(callback);
    connection.disconnect();

    await signal.fire();

    expect(called).toBe(false);
});
