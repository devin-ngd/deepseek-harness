# Public first-use maintenance tools

These two closed Node ESM commands start no application, service or listener. Node ^22.19 or >=24 is required. No npm install, model or private identity is included. The existing relay server remains a separately approved deployment.

Use the desktop field entry's public `relay-pair.json`. Review the proposal's host, loopback port, broker limits and one-pair capacity. Empty proposal pairs are invalid for a server; preparation supplies the explicit pair and canonical absolute trust path:

```sh
node prepare-public-config.mjs --config config.first-use.proposal.json --pair /selected/relay-pair.json --state /approved/public-state/replay-v1.jsonl --output /selected/new-relay-config.json --limits /selected/relay-endpoint-timers.json
node initialize-public-trust.mjs --config /selected/new-relay-config.json --pair /selected/relay-pair.json --limits /selected/relay-endpoint-timers.json
```

Preparation exclusively writes one new public JSON proposal and preserves existing output. Initialization strictly validates both selected public files before displaying only their fingerprints, host, pair/epoch, trust path and expiry; unknown fields never reach terminal output. It requires a local TTY and exact `INITIALIZE PUBLIC TRUST` confirmation after comparison. It exclusively creates the journal and synchronized head, with applicable directory synchronization. Existing, locked, corrupted, expired or uncertain state refuses; retain it for local review. It never repairs, overwrites, retries, deletes a lock, or starts/reloads the relay.

Both commands require the endpoint timer document generated for the selected desktop and phone candidates. Broker challenge/room issuance must fit both endpoint limits; incompatible values refuse before output or trust writes. The proposal uses10-second challenges and30-second rooms without widening the clients'15/60-second caps. Preserve the source configuration hashes with the candidate; a timer document is local configuration, not an authorization token.

The TTY confirmation remains required. Once the human authorizes the exact identities, binding and operation, an agent may enter ordinary product confirmations within that scope; the control is not an unconditional personal-presence requirement. Account login or another mandatory handoff remains separate.

Obtain separate approval for real public trust, the selected writable directory, service config and reload. The current ProtectHome=read-only unit needs an approved narrow ReadWritePaths for the selected public-state directory. Do not use a synthetic test pair or grant for deployment. Windows loopback/SDK tests and this built smoke do not qualify Linux durability, TLS, HUKS or a phone. Preserve old journal/head/tombstones and sealed archives when rolling code back.
