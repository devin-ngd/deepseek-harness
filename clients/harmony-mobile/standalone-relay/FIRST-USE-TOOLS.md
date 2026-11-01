# Public first-use maintenance tools

The bundled endpoint timer document is generated from the current desktop device example and phone configuration, with source hashes in `build-info.json`. Current room and endpoint limits are ten minutes; challenge deadlines remain independent. Updating an existing deployment requires the matching desktop and relay settings while retaining its public journals and original identities; the packaged proposal is not a replacement for an existing configuration.

These closed Node ESM maintenance commands start no application, service or listener. Node ^22.19 or >=24 is required. No npm install, model or private identity is included. The existing relay server remains a separately approved deployment.

Use the desktop field entry's public `relay-pair.json`. Review the proposal's host, loopback port, broker limits and one-pair capacity. Empty proposal pairs are invalid for a server; preparation supplies the explicit pair and canonical absolute trust path:

```sh
node prepare-public-config.mjs --config config.first-use.proposal.json --pair /selected/relay-pair.json --state /approved/public-state/replay-v1.jsonl --output /selected/new-relay-config.json --limits /selected/relay-endpoint-timers.json
node initialize-public-trust.mjs --config /selected/new-relay-config.json --pair /selected/relay-pair.json --limits /selected/relay-endpoint-timers.json
```

Preparation exclusively writes one new public JSON proposal and preserves existing output. Initialization strictly validates both selected public files before displaying only their fingerprints, host, pair/epoch, trust path and expiry; unknown fields never reach terminal output. It requires a local TTY and exact `INITIALIZE PUBLIC TRUST` confirmation after comparison. It exclusively creates the journal and synchronized head, with applicable directory synchronization. Existing, locked, corrupted, expired or uncertain state refuses; retain it for local review. It never repairs, overwrites, retries, deletes a lock, or starts/reloads the relay.

Both commands require the endpoint timer document generated for the selected desktop and phone candidates. Broker challenge/room issuance must fit both endpoint limits; incompatible values refuse before output or trust writes. The proposal uses10-second challenges and30-second rooms without widening the clients'15/60-second caps. Preserve the source configuration hashes with the candidate; a timer document is local configuration, not an authorization token.

The TTY confirmation remains required. Once the human authorizes the exact identities, binding and operation, an agent may enter ordinary product confirmations within that scope; the control is not an unconditional personal-presence requirement. Account login or another mandatory handoff remains separate.

Obtain separate approval for real public trust, the selected writable directory, service config and reload. The current ProtectHome=read-only unit needs an approved narrow ReadWritePaths for the selected public-state directory. Do not use a synthetic test pair or grant for deployment. Windows loopback/SDK tests and this built smoke do not qualify Linux durability, TLS, HUKS or a phone. Preserve old journal/head/tombstones and sealed archives when rolling code back.

## Relay configuration compatibility

The preparation tool omits the optional `nativeOrigin` field when its resolved policy is `deny`. The deployed legacy server accepts this representation and continues to refuse every WebSocket request containing an Origin header; omitting the field does not authorize a browser or a native identity. An explicitly selected `networkkit-v1` policy remains in the output and requires a separately reviewed compatible server. The preparation tool does not replace that policy with `deny`, remove an Origin header, or deploy a server. The source qualification record is `clients/harmony-mobile/docs/connection-recovery-rc2.6.md`.

## Explicit public revocation

The successor tool bundle includes `revoke-public-trust.mjs`. It starts no service and reads no identity store. Stop the selected relay first so its public writer releases the journal lock. Keep the original one-pair config and six-field pair input; use the same canonical `--state` path and endpoint timer file. Expired pairs remain revocable.

```sh
node revoke-public-trust.mjs preview --config config.json --pair pair.json --state /approved/public-state/trust.jsonl --limits relay-endpoint-timers.json
node revoke-public-trust.mjs revoke --config config.json --pair pair.json --state /approved/public-state/trust.jsonl --limits relay-endpoint-timers.json
node revoke-public-trust.mjs verify --config config.json --pair pair.json --state /approved/public-state/trust.jsonl --limits relay-endpoint-timers.json
```

Revocation requires a TTY and exact `REVOKE PUBLIC TRUST` decision after the bounded public preview. The tool appends only the selected pair's successor tombstone, preserves its keys and expiry, closes the writer, and strictly reopens the journal/head before returning verified. An exact already-revoked record is verified without another epoch increment. Verify mode creates and releases its own ordinary exclusive writer lock. Missing state is never initialized; locked, corrupt or uncertain state refuses without repair, deletion or config fallback. Operation and close failures remain separate.

`check-write-scope.mjs` is a Linux service preflight for an explicitly selected directory and UID. It verifies a writable selected directory under a read-only home mount and creates, syncs and removes one non-secret probe there. It creates no public pair or listener. The test service uses disabled configuration during preparation; real pairing still requires its own approved window and explicit durable desktop plus relay revocation.
