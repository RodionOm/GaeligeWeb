# GaeligeWeb

A Chrome extension that turns any web page into an Irish vocabulary lesson.
It translates words on the page into Irish, picks out the ones worth learning,
and quizzes you on them in a side panel while you read.

Built at an Irish-language hackathon at Dogpatch Labs, Dublin, in March 2026.

## The idea

Most language apps ask you to set aside time for them. This one doesn't:
you keep reading whatever you were already reading, and the vocabulary comes
to you. The extension picks the most useful words on the page rather than
translating everything, so you get a handful worth remembering instead of
a wall of Irish.

## How it works

1. `content.js` reads the visible text of the page and selects candidate words
2. The backend returns Irish translations for them
3. `content.js` swaps the chosen words in place on the page
4. The side panel (`sidepanel.html` / `sidepanel.js`) turns those words into
   a quiz — you type the Irish, it tells you if you got it

`background.js` is the extension's service worker, coordinating the content
script and the side panel.

## Structure
extension/
manifest.json Chrome extension manifest (MV3)
background.js service worker
content.js reads the page, selects and replaces words
sidepanel.html quiz UI
sidepanel.js quiz logic
sidepanel.css
server/ backend serving the translations

## What I'd do differently

Word selection was the interesting problem and the one we had least time for —
it picks words by simple heuristics rather than by how common or useful they
actually are in Irish. With a frequency list and some notion of what the user
already knows, the same extension would be a real learning tool rather than
a demo. Everything else was built to survive a weekend, not a user.
