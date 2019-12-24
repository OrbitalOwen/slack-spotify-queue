"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class express {
    listen(port) {
        if (this.callback) {
            const request = {
                query: {
                    code: "VALID_SPOTIFY_AUTH_CODE"
                }
            };
            const response = {
                send: () => { }
            };
            this.callback(request, response);
        }
        return {
            close: () => { }
        };
    }
    get(endpoint, callback) {
        if (endpoint === "/callback") {
            this.callback = callback;
        }
    }
}
exports.default = express;
//# sourceMappingURL=express.js.map