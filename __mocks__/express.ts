class express {
    private callback: (request, response) => void | null;

    public listen(port) {
        if (this.callback) {
            const request = {
                query: {
                    code: "VALID_SPOTIFY_AUTH_CODE"
                }
            };
            const response = {
                send: () => {}
            };
            this.callback(request, response);
        }
        return {
            close: () => {}
        };
    }

    public get(endpoint: string, callback: (request, response) => void) {
        if (endpoint === "/callback") {
            this.callback = callback;
        }
    }
}

export default express;
