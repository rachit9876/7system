# 7System

A fast, offline-first **markdown mind-mapping and note-taking** web app. Ideas live as
nodes on an infinite canvas; every node renders rich Markdown — headings, tables,
task lists, GitHub-style alerts, images and [Mermaid](https://mermaid.js.org)
diagrams — and the whole map autosaves to your browser. Cloud sync, sharing and a
mobile feed are available through an optional free account.

No build step, no framework: plain HTML, CSS and vanilla JavaScript modules.

---

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Desktop canvas editor (screens wider than 900 px; smaller screens are redirected to the mobile page) |
| `portal.html` | Dashboard for signed-in users: manage, rename, import/export, publish and delete cloud maps; change password; delete account |
| `mobile.html` | Mobile feed: read-only browsing of your maps, or a public map via share link |

## Features

### Editor
- **Infinite canvas** — pan (drag empty space), zoom 10 %–1500 % (wheel / toolbar / buttons), fit-to-view, toggleable dot grid, node lock.
- **Markdown nodes** — headings `#`–`######`, **bold**, *italic*, ~~strikethrough~~, `inline code`,
  fenced code blocks, bullet / ordered / task lists, tables with column alignment,
  blockquotes, GitHub alerts (`> [!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]`),
  horizontal rules, inline images and Mermaid flowcharts (```` ```mermaid ```` blocks).
- **Links** — `[label](https://…)` renders as a clickable link. Only `http:`, `https:` and
  `mailto:` URLs are honoured; other schemes (e.g. `javascript:`) are blocked.
- **Editing** — double-click a node to edit (textarea overlay), `Shift+Enter` to commit,
  `Enter` for a new line, `Esc` to cancel. Pasting a bare URL into a node automatically
  wraps it as a Markdown link.
- **Hierarchy** — right-click context menu: Add Child, Add Node, Connect (click a second
  node to link it), Disconnect, Delete Node. Deleting a node deletes its whole subtree.
  Cyclic connections (a node onto its own descendant) are rejected.
- **Undo / redo** — 100 steps of history covering node edits, moves, adds and deletes.
- **Persistence** — every change autosaves to `localStorage`; nothing is lost on reload.

### Import / export
- **JSON** — full-fidelity project files including viewport, theme and grid settings
  (`Ctrl+O` or toolbar). Exports are named `mindmap-YYYY-MM-DD_HH-MM.json`.
- **Markdown tree** — copy the whole map as an indented Markdown list (prefixed with a
  proofreading prompt for AI tools) and paste one back, either through the toolbar
  buttons or by pasting bullet text directly onto the canvas (`-`, `*`, `+` or `•`
  bullets; tabs count as 2 spaces).

### Cloud (optional)
Backed by Firebase (email + password auth, Realtime Database):
- **Login / Register** — one dialog; unknown emails are registered automatically.
- **Save / Load** — named maps in the cloud, overwrite prompts, delete with confirmation.
- **Portal dashboard** — bulk import/export, rename, multi-select delete, password change, account deletion.
- **Public sharing** — publish a map and share a read-only link (`mobile.html?u=<uid>&m=<name>`).
- Works fully offline without an account: the editor only needs the CDN scripts for
  Mermaid diagrams, and degrades gracefully (plain-text fallback) when they are unavailable.

### Appearance
- Light / dark theme, applied before first paint (no flash), remembered per browser,
  initially following your OS preference.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+O` | Import JSON |
| `Delete` | Delete selected node (and subtree) |
| `Esc` | Cancel edit / cancel connecting / close dialog |
| `Shift+Enter` (while editing) | Commit node text |
| `Enter` (while editing) | New line inside node |
| `Tab` / `Shift+Tab` (in dialogs) | Move focus (trapped inside the dialog) |

## Project structure

```
├── index.html            # Desktop editor
├── portal.html           # Cloud dashboard
├── mobile.html           # Mobile feed / public viewer
├── sample-mindmap.json   # Demo map loaded on first visit
├── wrangler.toml         # Cloudflare deployment metadata
├── css/
│   ├── styles.css        # Theme variables, components, utility classes
│   ├── portal.css        # Dashboard styles
│   └── mobile.css        # Mobile feed styles
├── js/
│   ├── editor.js         # Canvas engine, markdown renderer, history, cloud UI
│   ├── api.js            # Firebase integration (window.firebaseUtils)
│   ├── portal.js         # Dashboard logic
│   ├── mobile.js         # Feed logic (marked + DOMPurify)
│   └── shared/
│       ├── notifications.js  # Toast notifications
│       └── theme.js          # Theme helpers
└── assets/               # Icons and logo
```

## Running locally

The app uses ES modules, so it must be served over HTTP(S) — opening `index.html`
directly from disk (`file://`) will not load the scripts. Any static server works:

```bash
# from the repository root
python3 -m http.server 8000
# then open http://localhost:8000
```

Or with Node:

```bash
npx serve .
```

Deploying is equally simple: upload the repository to any static host
(GitHub Pages, Netlify, Cloudflare Pages, …). `wrangler.toml` is included for
Cloudflare deployments.

> **Note:** `index.html`, `portal.html` and `mobile.html` load
> Mermaid, marked, DOMPurify and the Firebase SDK from public CDNs
> (jsDelivr / gstatic). The editor remains fully usable offline — diagrams simply
> show an "Invalid diagram" placeholder and cloud features report
> "Service unavailable" until connectivity returns.

## Data format

Exports, cloud saves and `localStorage` all use the same JSON schema:

```jsonc
{
  "timestamp": "2026-07-03T16:29:51.821Z",
  "settings": { "zoom": 0.75, "pan": { "x": 135, "y": 86 }, "theme": "light", "showGrid": true },
  "nodes": [
    {
      "id": 1,
      "text": "# Title\nMarkdown **content**",
      "x": 645, "y": 77,       // world coordinates of the node's top-left corner
      "width": 358, "height": 110,
      "parentId": null          // hierarchy; null = root
    }
  ],
  "metadata": { "nextNodeId": 12, "selectedNodeId": null, "version": "1.0" }
}
```

Malformed files are rejected on import; parent references to missing nodes are
dropped and cycles are broken automatically so the map can never end up in an
untraversable state.

## Browser support

Any modern evergreen browser (Chrome, Edge, Firefox, Safari). The interface is
optimized for desktop on the editor page; phones and tablets get the mobile feed.

## Notable fixes in this revision

A full code review was performed and the following issues were corrected:

- **Offline reliability** — the editor no longer fails to load when the Firebase
  CDN is unreachable (the auth SDK is now imported dynamically with a fallback).
  Mermaid initialization is guarded on all pages.
- **Crash safety** — connecting a node to its own descendant (which used to cause
  infinite recursion / stack overflow on delete or export) is now blocked, and
  deletion plus JSON import are cycle-safe.
- **Security** — `javascript:` (and other non-web) link schemes in node text can
  no longer be executed via click; external links open with `noopener`.
  Code blocks on the mobile feed are HTML-escaped before sanitization.
- **Correctness** — pasted trees are centered correctly on HiDPI screens; the
  "New Canvas" node is placed at the true viewport centre; the global paste
  position math was fixed; `Ctrl+Shift+Z` redo was added; hotkeys no longer fire
  behind open dialogs.
- **UX polish** — toast notifications received correct title/message/type
  arguments everywhere; failed cloud loads now show an error; dialogs close on
  backdrop click / `Esc`; the saved theme is applied before first paint; renaming
  validates illegal Firebase path characters; the public-link button warns when a
  map is private; the mobile feed shows a clear message when offline.
- **Hygiene** — ~30 CSS utility classes used by markup but never defined were
  added; the internal `_cachedText` field is stripped from exports, cloud saves
  and the sample map; the unversioned `marked` CDN dependency is pinned to a
  major version; a favicon and cache-busting script versions were added; the
  misleading `exportAsRXT` name and the export filename timestamp format were
  cleaned up.

## License

None specified — all rights reserved by the repository owner.
