import winston from "winston";
const NODE_ENV = process.env.NODE_ENV;

if (NODE_ENV === "test") {
    winston.configure({
        transports: [new winston.transports.Console({ silent: true })]
    });
} else {
    winston.configure({
        transports: [
            new winston.transports.File({
                filename: "logs/log.log",
                maxsize: 5242880,
                maxFiles: 5,
                format: winston.format.combine(
                    winston.format.timestamp({
                        format: "YYYY-MM-DD hh:mm:ss"
                    }),
                    winston.format.json()
                )
            }),
            new winston.transports.Console()
        ]
    });
}
