console.log("content.js loaded on:", location.href);

function extractPageContent() {
  const title = document.title || "";

  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map(el => el.innerText.trim())
    .filter(Boolean)
    .slice(0, 10);

  const paragraphs = Array.from(document.querySelectorAll("p"))
    .map(el => el.innerText.trim())
    .filter(text => text.length > 40)
    .slice(0, 20);

  return {
    url: location.href,
    title,
    headings,
    paragraphs
  };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received in content.js:", message);

  if (message.type === "EXTRACT_PAGE") {
    const data = extractPageContent();
    sendResponse(data);
  }
});