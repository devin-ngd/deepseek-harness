/** SDK substitute only; no native or real socket/key call occurs. */
export const fakeNetwork = { socket: undefined, connects: 0, factory: () => ({ callbacks: new Map(), closeCalls: 0, on(name, callback) { this.callbacks.set(name, callback) }, async connect() { fakeNetwork.connects++; return true }, async send() { return true }, async close() { this.closeCalls++; return true } }) }
export const webSocket = { createWebSocket() { const socket = fakeNetwork.factory(); fakeNetwork.socket = socket; return socket } }
