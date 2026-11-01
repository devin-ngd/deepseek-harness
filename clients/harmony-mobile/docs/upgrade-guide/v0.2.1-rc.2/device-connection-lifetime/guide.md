---
kind: upgrade-guide
description: Ten-minute Harmony relay rooms require matching desktop and phone timer settings.
---

# Harmony device connection lifetime

## Change

The private rc2.19 candidate issues ten-minute relay rooms. Desktop and phone examples accept ten minutes, and desktop device tickets use the same lifetime. Older endpoints capped at sixty seconds reject these rooms. The rc2.21 proxy proposal also raises both WebSocket read timeouts to 660 seconds: a sixty-second silent control connection otherwise closes an active data room. An earlier signed route deadline still caps rooms and tickets; wire messages, original identities, bindings and journal formats are unchanged.

## Migration

1. Review the [complete offline candidate](../../../connection-lifetime-rc2.19.md) and obtain deployment approval before changing an installed app or relay.
2. Merge only `relay.maxRoomTtlMs: 600000` and `connectionTtlMs: 600000` into the existing desktop device component. Use the matching phone candidate with `relay.maxRoomTtlMs: 600000`.
3. Merge `maxRoomTtlMs: 600000` and `broker.roomTtlMs: 600000` into the existing relay configuration. Preserve its identity pins, bindings, journal paths, head files and unrelated settings; do not initialize new pairing state.
4. Regenerate the endpoint timer projection from the selected configurations. For rc2.21, merge only `proxy_read_timeout 660s` into the existing exact `/harmony/relay/control/v1` and `/harmony/relay/v1` nginx locations; preserve TLS, headers, admission limits and unrelated sites. After deployment approval, validate nginx configuration before reloading. Review the [candidate evidence](../../../proxy-timeout-rc2.21.md) and retain earlier route deadlines.
5. In a separately approved window, confirm the loaded settings and three-minute continuous connection, then validate the dedicated MVP session's reply and stop actions. Offline regression and compilation do not establish device acceptance.
