const STORAGE_KEY = 'amz_spending_cache';
const CACHE_TIME = 1000 * 60 * 30;

const delay = ms => new Promise(res => setTimeout(res, ms));

async function scrapeWithTab(filter) {
  console.log(`[BG] Avvio scraping tab-based per: ${filter}`);

  const tab = await chrome.tabs.create({
    url: `https://www.amazon.it/your-orders/orders?timeFilter=${filter}&language=it_IT`,
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
            console.log(`[BG] Risultato tab ${filter}:`, data);

            chrome.tabs.remove(tab.id);

            if (data.isBlocked) resolve(-1);
            else resolve(data.sum);
          } catch (err) {
            console.error('[BG] Script injection failed:', err);
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
        const t30 = await scrapeWithTab('last30');
        if (t30 === -1) {
          sendResponse({ error: 'AUTH_REQUIRED' });
          return;
        }

        const currentYear = new Date().getFullYear();
        const tYear = await scrapeWithTab(`year-${currentYear}`);
        const tLast = await scrapeWithTab(`year-${currentYear - 1}`);

        const data = { t30, tYear, tLast };
        await chrome.storage.local.set({ [STORAGE_KEY]: { data, ts: now } });
        sendResponse(data);
      }
    });
    return true;
  }
});
