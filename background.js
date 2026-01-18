const STORAGE_KEY = 'amz_spending_cache';
const CACHE_TIME = 1000 * 60 * 30;

async function scrapeWithTab(filter) {
  const tab = await chrome.tabs.create({
    url: `https://www.amazon.it/your-orders/orders?timeFilter=${filter}`,
    active: false,
  });

  return new Promise(resolve => {
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);

        setTimeout(async () => {
          try {
            const results = await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              func: () => {
                let pageSum = 0;
                const items = document.querySelectorAll(
                  '.order-header__header-list-item',
                );

                items.forEach(item => {
                  if (/total|totale/i.test(item.innerText)) {
                    const lines = item.innerText.trim().split('\n');
                    const priceRaw = lines[lines.length - 1];
                    let clean = priceRaw.replace(/[^\d.,]/g, '').trim();
                    if (clean.includes('.') && clean.includes(',')) {
                      clean = clean.replace(/\./g, '').replace(',', '.');
                    } else if (clean.includes(',')) {
                      clean = clean.replace(',', '.');
                    }
                    pageSum += parseFloat(clean) || 0;
                  }
                });
                return {
                  sum: pageSum,
                  isBlocked:
                    document.body.innerText.includes('captcha') ||
                    document.querySelector('form[action*="signin"]') !== null,
                };
              },
            });

            const data = results[0].result;
            chrome.tabs.remove(tab.id);

            if (data.isBlocked) resolve(-1);
            else resolve(data.sum);
          } catch (err) {
            chrome.tabs.remove(tab.id);
            resolve(0);
          }
        }, 2000);
      }
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_SPENDING') {
    chrome.storage.local.get(STORAGE_KEY).then(async cached => {
      const now = Date.now();
      if (cached[STORAGE_KEY] && now - cached[STORAGE_KEY].ts < CACHE_TIME) {
        sendResponse(cached[STORAGE_KEY].data);
      } else {
        const last30 = await scrapeWithTab('last30');
        if (last30 === -1) {
          sendResponse({ error: 'AUTH_REQUIRED' });
          return;
        }

        const months3 = await scrapeWithTab('months-3');

        const data = { last30, months3 };
        await chrome.storage.local.set({ [STORAGE_KEY]: { data, ts: now } });
        sendResponse(data);
      }
    });
    return true;
  }
});
