# Learn Spotlight

A Chrome extension frontend for quick course-resource search. It currently uses **sample results only**; LEARN is not connected yet.

The overlay is built with React, Framer Motion, and Lucide icons. Its component structure follows the Spotlight example supplied for this project: a focused search input, animated placeholder and expanding result area, hover shortcut buttons, and icon/title/description result rows. The colours and result details are tailored to course materials.

## Build and try it

1. Run `npm install` and `npm run build` in this folder.
2. Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this project folder. If it is already loaded, click **Reload** instead.
3. On a normal webpage, press **⌘⇧K** on Mac or **Ctrl+Shift+K** on Windows/Linux. The extension icon also opens it.
4. Type to expand the sample results. Use ↑/↓ to move, Enter to preview a selection, and Esc to close.

After changing React or CSS files, run `npm run build`, click **Reload** on the extension, and refresh the webpage. You do not need to select the folder again. If Chrome did not assign the shortcut, set one at `chrome://extensions/shortcuts`.

For a design preview without rebuilding the extension, run `npm run dev` and open the local address Vite prints. Chrome blocks the overlay on internal pages such as `chrome://extensions` and in the Chrome Web Store.

The extension bundles all code locally and uses an isolated Shadow DOM to keep webpage styles separate. It does not collect or send data.
