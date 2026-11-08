/** Public routing constants shared by the independent relay, optional DSH adapter and clients; neither value authorizes a join. */
export const RELAY_PATH = '/harmony/relay/v1'
/** RFC6455 subprotocol for binary E2E envelopes and one content-free ready notification. */
export const RELAY_SUBPROTOCOL = 'dsh-relay-v1'
/** Maximum WebSocket fragments per logical data message at the relay. */
export const RELAY_MAX_MESSAGE_FRAGMENTS = 128
