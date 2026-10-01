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
