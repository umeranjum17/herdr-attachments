# herdr-attachments

The files your agent wrote for you, listed right in the session: an
Attachments pill on every session that opens a sheet of the pane's dump
directory — screenshots, APKs, logs, documents — with MIME-aware icons and
sizes. Metadata-only listing, one small read-only plugin.

Agents hand artifacts to a muxr session by writing them into the pane's
attachment directory (`~/.muxr/attachments/pane/<pane-id>`); muxr's own
documentation defines that hand-off. This plugin is the viewer for it: it
lists what is there and hands the bytes to muxr's kernel attachment pipeline
only when you tap something.

## What it does

- **Session pills** — an Attachments pill in the session, fed by one
  `host.rpc` read of the pane's dump directory (newest first, capped at 50
  rows with an honest total).
- **Content ids for small files** — files up to 2 MiB are hashed (SHA-256)
  at listing time so muxr can stream them through its relay-backed read
  path; larger files resolve locally by name and are never re-hashed.
- **Offline honesty** — cached items stay visible; a failed refresh shows
  retry state instead of pretending the directory is empty.

## What it will not do

- **No bytes in the listing.** The RPC returns names, sizes, timestamps,
  icons and content ids — never file contents. Bytes move only through the
  kernel attachment action, which stays muxr-owned: transfer, authorization
  and encryption are not this plugin's job.
- **No writes.** One read RPC; no actions, no startup hooks, no panes, no
  secrets, no config.
- **No other attachment sources.** It lists exactly one directory: the
  current pane's dump directory. Camera uploads and other native attachment
  flows are muxr product code.

## Install

Requires [Herdr](https://herdr.dev) ≥ 0.8.0, `node` ≥ 20 on `PATH`, and a
muxr build with declarative UI schema 2 or newer (any current build; the app
checks and will list the plugin as unavailable otherwise). Linux and macOS.

```sh
muxr plugin install umeranjum17/herdr-attachments
muxr plugin list        # muxr.attachments should appear, enabled
```

The Attachments pill appears in sessions that have a pane id.

Toggle without uninstalling:

```sh
herdr plugin disable muxr.attachments
herdr plugin enable muxr.attachments
```

## Uninstall

```sh
muxr plugin remove muxr.attachments    # or: herdr plugin uninstall muxr.attachments
```

No residue: the plugin keeps no state outside the listing it serves and
writes nothing anywhere.

## Develop

```sh
npm test   # node built-in runner, zero dependencies; also runs in CI on every PR
```

The tests drive the real `rpc.mjs` against a real dump directory in a
temporary `MUXR_HOME` — ordering, caps, hashing thresholds and hostile pane
ids included — not mocks of its own output.

## License

MIT — see [LICENSE](LICENSE).
