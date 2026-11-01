---
kind: upgrade-guide
description: Harmony saved-device startup and ten-minute relay rooms need matching endpoint and relay settings.
---

# Harmony device connection lifetime

## Change

The private rc2.30 candidate defaults the enabled desktop `/device` component to `connectionMode: paired`. Its phone candidate enables `deviceAutoConnect`; saved devices connect on startup and retry every five seconds. Manual disconnect stops retries. The relay's `pairedDevices: true` reuses verified original bindings retained in its device-route history, including bindings from retired temporary windows; device revocations still apply. No identity, binding, Session or history format changes. See [paired-device startup](../../../paired-connection-rc2.30.md).

The private rc2.19 candidate issues ten-minute relay rooms. Desktop and phone examples accept ten minutes, and desktop device tickets use the same lifetime. Older endpoints capped at sixty seconds reject these rooms. The rc2.21 proxy proposal also raises both WebSocket read timeouts to 660 seconds: a sixty-second silent control connection otherwise closes an active data room. An earlier signed route deadline still caps rooms and tickets; wire messages, original identities, bindings and journal formats are unchanged.

## Migration

1. Review the [complete offline candidate](../../../connection-lifetime-rc2.19.md) and obtain deployment approval before changing an installed app or relay.
2. Merge only `relay.maxRoomTtlMs: 600000` and `connectionTtlMs: 600000` into the existing desktop device component. Use the matching phone candidate with `relay.maxRoomTtlMs: 600000`.
3. Merge `maxRoomTtlMs: 600000` and `broker.roomTtlMs: 600000` into the existing relay configuration. Preserve its identity pins, bindings, journal paths, head files and unrelated settings; do not initialize new pairing state.
4. Regenerate the endpoint timer projection from the selected configurations. For rc2.21, merge only `proxy_read_timeout 660s` into the existing exact `/harmony/relay/control/v1` and `/harmony/relay/v1` nginx locations; preserve TLS, headers, admission limits and unrelated sites. After deployment approval, validate nginx configuration before reloading. Review the [candidate evidence](../../../proxy-timeout-rc2.21.md) and retain earlier route deadlines.
5. For rc2.30, update both endpoints and the relay together, merging `connectionMode: paired`, `reconnectMs: 5000` into the desktop device component and `pairedDevices: true` into the relay. Keep existing verified device-route history. Use `connectionMode: window` for manual temporary windows; the rc2.30 phone candidate uses paired mode. The normal personal-device service remains running after setup. Offline checks do not establish original-device automatic connection.
