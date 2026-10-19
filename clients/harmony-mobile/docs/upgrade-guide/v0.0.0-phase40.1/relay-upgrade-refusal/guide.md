---
kind: upgrade-guide
description: Relay upgrade admission failures return empty HTTP 403 responses instead of resetting the TCP connection.
---

# Relay upgrade refusal

## Change

The private relay candidate after `0.0.0-phase40.1` sends the same empty `403 Forbidden`, `Connection: close`, `Content-Length: 0` and `Cache-Control: no-store` for every rejected upgrade admission. It closes the stream after the write flushes. No request field, identity, capability, room state or failure reason appears in the response. The deployed version remains unchanged and continues to close directly, which nginx presents as 502.

Accepted WebSocket handshakes, role proofs, room issuance, one-use tokens, E2E frames, configuration, limits, journals and expiry do not change. TCP connection limits and HTTP parser failures still use their existing transport-level rejection. Maintained ws may return its own 400 for malformed WebSocket syntax after admission.

## Migration

1. Obtain explicit approval for the candidate artifact's exact hash before replacing the deployed package. Preserve public state and the predecessor archive; do not install DSH or run npm on the server.
2. Update external refusal checks to require an empty 403 for rejected admission, rather than a connection reset or nginx 502. Keep valid traffic and resource limits unchanged.
3. Validate both exact WS routes, zero successful unauthorized handshakes, no response-field leakage, accepted routing, and stop/start cleanup. Local proxy simulation is not an actual nginx or deployed-candidate acceptance result.
