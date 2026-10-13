# save-file: save what a page makes (MP3s and more)

Gives any kit app a **Save** button: the page makes the bytes, the person picks where they go.

- **In the app** (Electron): `main.js` registers a native "Save as" dialog behind `app.saveFile(bytes, name)`.
  It writes only the file the person picks, only the file types you allow (mp3 wav m4a zip csv json txt md png jpg jpeg webp pdf by default),
  and never touches the network, so Bouncer has nothing to allow.
- **On a claude.ai page:** the page must declare the `downloads` capability. It doesn't take .mp3, so MP3s arrive inside a .zip.
- **In a plain browser:** a normal download.

## Wiring (3 steps)
1. **Main:** `require("../../kit/save-file/main.js").registerSaveFile({ subfolder: "My App", isAllowedSender: e => e.sender === win.webContents })`
   (default folder: Music/<subfolder>; the dialog remembers the last folder).
2. **Preload:** add `saveFile: (bytes, name, extras) => ipcRenderer.invoke("kit:save-file", { bytes, name, extras })` to the object you expose (e.g. `window.mdfmApp`).
   `extras` (optional, `[{ name, bytes }]`) are written next to the file picked, with no second dialog. The MDFM floppy uses it to put the song's `.mid` beside its `.mp3`; allow `mid` in `types`.
3. **Page:** a button and one call:
   - The MDFM radio: `KitSave.attachSong(button, radio, { app: window.mdfmApp, onStatus })` saves the song that's playing as an MP3, plus a MIDI file of its notes
     (rendered again from the top, off the live audio, then encoded). The MDFM radio page (kit/mdfm/radio-page) already has the floppy button.
   - Anything else: `KitSave.attach(button, { app: window.mdfmApp, make: async () => ({ bytes, name: "report.csv" }) })`.
   Load `kit/save-file/renderer/save-button.js` after `mdfm.iife.js` (or on its own when there's no radio).

MP3 encoding comes from the MDFM package (`MDFM.encodeMp3(audioBuffer, meta)`, lamejs 1.2.1, LGPL-3.0).
