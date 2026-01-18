function injectPopup(data) {
  const existing = document.getElementById('amz-spending-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.id = 'amz-spending-popup';
  Object.assign(popup.style, {
    position: 'fixed',
    top: '20px',
    right: '20px',
    zIndex: '2147483647',
    backgroundColor: '#cc0000',
    color: 'white',
    padding: '15px',
    borderRadius: '8px',
    boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
    fontFamily: 'Arial, sans-serif',
    minWidth: '220px',
    border: '2px solid white',
  });

  popup.innerHTML = `
        <div style="font-weight:bold; border-bottom:1px solid rgba(255,255,255,0.3); margin-bottom:10px; padding-bottom:5px; display:flex; justify-content:space-between;">
            <span>Spending Tracker</span>
            <span id="amz-close" style="cursor:pointer; padding:0 5px;">×</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
            <div style="display:flex; justify-content:space-between;">
                <span>Last 30 days:</span> 
                <b>EUR ${data.last30.toFixed(2)}</b>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:15px; background:rgba(0,0,0,0.2); padding:5px; border-radius:4px;">
                <span>Past 3 months:</span> 
                <b>EUR ${data.months3.toFixed(2)}</b>
            </div>
        </div>
    `;

  document.body.appendChild(popup);
  document.getElementById('amz-close').onclick = () => popup.remove();
}

async function init() {
  if (
    window.location.href.includes('signin') ||
    window.location.href.includes('checkout')
  )
    return;

  chrome.runtime.sendMessage({ action: 'GET_SPENDING' }, response => {
    if (response && !response.error) {
      injectPopup(response);
    }
  });
}

init();

async function init() {
  if (
    window.location.href.includes('signin') ||
    window.location.href.includes('checkout')
  )
    return;

  chrome.runtime.sendMessage({ action: 'GET_SPENDING' }, response => {
    if (response && !response.error) {
      injectPopup(response);
    } else if (response && response.error === 'AUTH_REQUIRED') {
      console.log('Tracker: Authentication required to fetch orders.');
    }
  });
}

init();
