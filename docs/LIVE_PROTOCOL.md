# Live protocol version 1

`schema/trace-event.schema.json` defines the event envelope. Every event carries
`sessionId`, monotonic `sequence`, execution `revision`, and an object payload.

## Roles and privacy

Every live session generates unrelated audience and presenter tokens. The
server derives the immutable connection role from the token using constant-time
comparison; the URL `role` parameter is display state, not authorization.

Audience clients receive no `notes` renderings. When a presentation contains
notes, the audience `execution_reset` contains line-preserving blank authoring
source so note literals cannot leak through raw source. Presenter clients
receive the complete trace. Diagnostics and producer filesystem paths are also
presenter-only.

The printed Presenter URL is the shared slide deck. An optional Notes URL
(`view=notes`) is the same presenter token for a phone or second window.
Presenter sockets send `set_step` only when the user navigates. Audience
sockets follow `presentation_state` and do not advance the talk locally.

Only presenter sockets may send:

```json
{"type":"set_step","stepIndex":12}
```

The server broadcasts a versioned `presentation_state` event containing the
new `stepIndex` to connected and reconnecting clients.

A live pointer, if added, is the same class of state: presenter-only inbound,
broadcast to every role, omitted from the snapshot. It is not part of protocol
version 1. See `docs/PRESENTATION_GENRES.md`.

## Revision transaction

1. `execution_reset` declares `formatVersion`, complete source `files`, the
   `frames`, `renderings`, and `outputs` tables, and the sparse
   `presentationSteps` playback track for the revision.
2. One or more `step_append` events add ordered step chunks. `offset` MUST equal
   the number of steps already received for the active revision. Steps carry
   only table indexes, so appended chunks contain no presenter content of their
   own; the audience boundary is enforced once, on the reset tables.
3. `complete` commits the revision. Only then may the player replace its last
   valid trace.
4. `diagnostic` aborts publication implicitly: the partial revision is retained
   only until the next reset and the last valid trace remains playable.

`trace_snapshot` remains a compatibility fallback. Unknown, reordered,
cross-session, oversized, or unsupported-version events are rejected.
The viewer enforces both per-message and aggregate revision byte limits.

## Reconnection

The player reconnects with `sessionId` and `after=<last sequence>`. The producer
replays retained events after that checkpoint. If the session changed or the
checkpoint fell out of history, it sends `hello` followed by the current valid
revision transaction.
The current presentation position is emitted as a fresh checkpoint after a full
replay so its sequence remains monotonic.

## Security

The development producer binds to loopback, generates a random token, checks it
with a constant-time comparison, and requires an explicitly allowed browser
Origin. Live mode is an authoring feature and MUST NOT expose arbitrary Python
execution on a public interface.
Inbound messages are capped at 64 KiB; audience sockets are read-only and slow
consumers are disconnected to bound server memory.
