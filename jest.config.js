module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testPathIgnorePatterns: [".d.ts", ".js"],
    setupFilesAfterEnv: ["./lib/configureLogger.js"]
};
