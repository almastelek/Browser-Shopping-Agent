/**
 * Messaging utilities for communication between popup, background, and content scripts
 */

const MESSAGE_TYPES = {
    // Popup -> Background
    ANALYZE_PAGE: 'ANALYZE_PAGE',
    FIND_DEALS: 'FIND_DEALS',
    COMPARE_TOP3: 'COMPARE_TOP3',
    GET_PREFERENCES: 'GET_PREFERENCES',
    SAVE_PREFERENCES: 'SAVE_PREFERENCES',

    // Background -> Content
    EXTRACT_PAGE_CONTEXT: 'EXTRACT_PAGE_CONTEXT',
    SCRAPE_SEARCH_RESULTS: 'SCRAPE_SEARCH_RESULTS',
    HIGHLIGHT_ELEMENTS: 'HIGHLIGHT_ELEMENTS',
    INJECT_OVERLAY: 'INJECT_OVERLAY',

    // Response types
    CONTEXT_RESULT: 'CONTEXT_RESULT',
    RANKED_RESULTS: 'RANKED_RESULTS',
    SCRAPE_RESULT: 'SCRAPE_RESULT',
    ERROR: 'ERROR',
    SUCCESS: 'SUCCESS'
};

/**
 * Send message to background script from popup
 */
async function sendToBackground(type, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Send message to content script in a specific tab
 */
async function sendToTab(tabId, type, payload = {}) {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type, payload }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else if (response?.error) {
                reject(new Error(response.error));
            } else {
                resolve(response);
            }
        });
    });
}

/**
 * Send message to active tab's content script
 */
async function sendToActiveTab(type, payload = {}) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
        throw new Error('No active tab found');
    }
    return sendToTab(tab.id, type, payload);
}

/**
 * Create a standard success response
 */
function successResponse(data = {}) {
    return { type: MESSAGE_TYPES.SUCCESS, ...data };
}

/**
 * Create a standard error response
 */
function errorResponse(message, details = null) {
    return { type: MESSAGE_TYPES.ERROR, error: message, details };
}

// Expose to global scope
if (typeof window !== 'undefined') {
    window.AgenticMessaging = {
        MESSAGE_TYPES,
        sendToBackground,
        sendToTab,
        sendToActiveTab,
        successResponse,
        errorResponse
    };
}

// Also expose for service worker (module context)
if (typeof globalThis !== 'undefined') {
    globalThis.MESSAGE_TYPES = MESSAGE_TYPES;
    globalThis.sendToTab = sendToTab;
    globalThis.successResponse = successResponse;
    globalThis.errorResponse = errorResponse;
}
