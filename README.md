# Gmail Resizer

This Chrome extension tries to change Gmail's **Maximum page size** setting based on the current window width.

## How it works

When Gmail is opened or resized, the extension:
1. checks the current viewport width,
2. matches it to a configured rule,
3. opens Gmail Settings → General in a background tab,
4. changes **Maximum page size**,
5. clicks **Save Changes**,
6. closes the settings tab.

## Default rules

- 0–1399 px → 10 conversations
- 1400–1999 px → 25 conversations
- 2000+ px → 50 conversations

## Install

1. Unzip the extension.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped folder.

## Notes

- Gmail does not expose a stable official API for this setting, so this is brittle.
- This version is designed for Gmail in English.
- If Gmail changes its settings UI, the automation may stop working.
- Because Gmail stores this as an account setting, changing displays may trigger a re-save of the setting.

## Files

- `manifest.json` — extension manifest
- `background.js` — creates settings automation tabs and runs the save logic
- `content.js` — reports Gmail viewport width
- `options.html` / `options.js` — configuration UI
