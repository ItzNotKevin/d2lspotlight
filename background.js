async function toggleSpotlight(tab) {
  if (!tab?.id) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["dist/spotlight.js"]
    });
  } catch (error) {
    // Chrome blocks injection into its own pages and some protected sites.
    console.warn("Learn Spotlight cannot open on this page.", error);
  }
}

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command === "toggle-spotlight") {
    await toggleSpotlight(tab);
  }
});

chrome.action.onClicked.addListener(toggleSpotlight);
