export interface IActionResult {
    success: boolean;
    message?: string;
    callback?: (index: number, creatorId: string) => Promise<ICommandResponse>;
}

export interface ICommandResponse extends IActionResult {
    type: "dm" | "broadcast";
}
