# Optional legacy DSH relay adapter

The current source shares RelayRooms/RelayUpgrade with the user-selected independent Node relay in standalone-relay; the server no longer needs this DSH package or runtime. The sealed phase36 artifact is preserved as a historical optional adapter.

This phase36 package adds one exact WebSocket upgrade route to the maintained DSH WebServer. Both bundle rows and `config.enabled` default to disabled. It has no bin, credential reader, HTTP provisioning route, operator Connection, Session, shell or model. Install only into a separately approved minimal `dsh` profile; installation and activation have not occurred.

An approved local provisioner must call the non-Remote `ctx.harmonyRelay.provision` with an opaque room id, two independent join capability digests and a short absolute expiry. No provisioner, key/token generator, secret store or remote enrollment controller is bundled. An enabled empty profile therefore denies every join. Capabilities are one-use, role-specific and independent of desktop execution grants; room loss requires fresh local provisioning and fresh E2E keys, with original command ids preserved by the desktop journal.

The external path is `wss://dsh.devinho.me/harmony/relay/v1`, subprotocol `dsh-relay-v1`. Join uses Authorization plus room/role headers; no URL tokens, cookies or browser Origin are accepted. A text `{"relay":"ready","v":1}` is emitted once after both peers join; all subsequent payloads are opaque binary E2E frames. This notification grants no identity or operation. Text payloads, missing peers, expiry, disconnect, frame/queue budget exhaustion or send failure close both peers. There is no offline queue, persistent room or automatic redial.

Only existing WebServer HTTPS or explicitly configured `127.0.0.1` behind the approved TLS proxy is accepted. The proposed loopback port 17846 and server route are unverified; the disabled templates must never be copied/activated before server inventory and approval. The external proxy must enforce connection/upgrade limits, including invalid joins and WS control frames, which room budgets alone cannot bound. Log no payload, raw header, token, key or URL query.

The custom E2E state remains an unqualified prototype. Read-only source review and memory tests do not establish native TLS/HUKS behavior, audited cryptographic protocol security, internet availability, device installation or production readiness. See `clients/harmony-mobile/docs/phase36-relay-handoff.md` for approval, rollback and remaining acceptance requirements.

The nativeOrigin Config field defaults to deny; networkkit-v1 selects the shared phone Origin compatibility policy described in the [independent relay reference](../standalone-relay/README.md). It changes no room capability or endpoint proof. No deployed relay setting is changed by this source option.
