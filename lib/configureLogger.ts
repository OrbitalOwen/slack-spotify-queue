import winston from "winston";
const NODE_ENV = process.env.NODE_ENV;

if (NODE_ENV === "test") {
    winston.configure({
        transports: [new winston.transports.Console({ silent: true, format: winston.format.simple() })]
    });
} else {
    winston.configure({
        transports: [
            new winston.transports.Console({
                level: "debug",
                format: winston.format.simple()
            })
        ]
    });
}
