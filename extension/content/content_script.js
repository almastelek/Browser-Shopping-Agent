/**
 * Content Script - Entry point for page analysis and highlighting
 */

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
        .then(sendResponse)
        .catch(error => {
            console.error('[Agentic Content] Error:', error);
            sendResponse({ error: error.message });
        });

    return true; // Async response
});

async function handleMessage(message) {
    const { type, payload } = message;

    switch (type) {
        case 'EXTRACT_PAGE_CONTEXT':
            return extractPageContext();

        case 'SCRAPE_SEARCH_RESULTS':
            return scrapeSearchResults(payload?.source);

        case 'HIGHLIGHT_ELEMENTS':
            return highlightElements(payload);

        case 'INJECT_OVERLAY':
            return injectOverlay(payload);

        default:
            throw new Error(`Unknown message type: ${type}`);
    }
}

/**
 * Detect page type and extract context
 */
function extractPageContext() {
    const url = window.location.href;
    const hostname = window.location.hostname;

    // Detect page type
    let context = {
        type: 'unknown',
        url: url,
        source: hostname,
        timestamp: new Date().toISOString()
    };

    // Try product page extraction first
    if (window.GenericProductParser) {
        const productContext = window.GenericProductParser.extract();
        if (productContext.type === 'product') {
            return { context: productContext };
        }
    }

    // Try search page extraction
    if (window.GenericSearchParser) {
        const searchContext = window.GenericSearchParser.extract();
        if (searchContext.type === 'search') {
            return { context: searchContext };
        }
    }

    // Fallback extraction
    context.type = 'unknown';
    context.title = document.title;
    context.keywords = extractKeywordsFromPage();

    return { context };
}

/**
 * Fallback keyword extraction from page content
 */
function extractKeywordsFromPage() {
    // Try meta keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
        return metaKeywords.content;
    }

    // Try extracting from title
    const title = document.title || '';
    return title
        .replace(/[|\-–—:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .slice(0, 5)
        .join(' ');
}

/**
 * Scrape search results from current page
 */
function scrapeSearchResults(source) {
    let listings = [];

    // Source-specific scrapers
    if (source === 'newegg' && window.NeweggSearchParser) {
        listings = window.NeweggSearchParser.scrape();
    } else if (window.GenericSearchParser) {
        // Generic fallback
        listings = window.GenericSearchParser.scrapeResults();
    }

    return {
        listings,
        count: listings.length,
        source: source || 'unknown'
    };
}

/**
 * Highlight price, shipping, returns elements on page
 */
function highlightElements(payload) {
    if (window.AgenticHighlighter) {
        window.AgenticHighlighter.highlight();

        // Inject overlay if score data provided
        if (payload?.score !== undefined) {
            window.AgenticHighlighter.injectOverlay({
                score: payload.score,
                bullets: payload.bullets || []
            });
        }
    }

    return { success: true };
}

/**
 * Inject score overlay on page
 */
function injectOverlay(payload) {
    if (window.AgenticHighlighter) {
        window.AgenticHighlighter.injectOverlay(payload);
    }
    return { success: true };
}

// Log when content script loads
console.log('[Agentic Shopper] Content script loaded on:', window.location.hostname);
