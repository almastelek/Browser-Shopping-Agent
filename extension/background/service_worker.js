/**
 * Service Worker - Background script for Agentic Shopper
 * Orchestrates the agent loop: gather → normalize → rank → act
 */

// Constants
const SERVER_URL = 'http://127.0.0.1:8000';
const NEWEGG_SEARCH_URL = 'https://www.newegg.com/p/pl?d=';

// Agent State
const agentState = {
    lastRun: null,
    candidates: [],
    ranked: [],
    context: null,
    decisionSpec: null
};

// ============================================================
// Message Handler
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender)
        .then(sendResponse)
        .catch(error => {
            console.error('Message handler error:', error);
            sendResponse({ error: error.message });
        });

    // Return true to indicate async response
    return true;
});

async function handleMessage(message, sender) {
    const { type, payload } = message;

    switch (type) {
        case 'ANALYZE_PAGE':
            return await handleAnalyzePage();

        case 'FIND_DEALS':
            return await handleFindDeals(payload);

        case 'COMPARE_TOP3':
            return await handleCompareTop3(payload);

        case 'GET_PREFERENCES':
            return await getStoredPreferences();

        case 'SAVE_PREFERENCES':
            return await savePreferences(payload);

        default:
            throw new Error(`Unknown message type: ${type}`);
    }
}

// ============================================================
// Analyze Page Handler
// ============================================================

async function handleAnalyzePage() {
    try {
        // Get active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            throw new Error('No active tab found');
        }

        // Inject content script if needed and request context extraction
        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'EXTRACT_PAGE_CONTEXT'
        });

        if (response.error) {
            throw new Error(response.error);
        }

        agentState.context = response.context;
        return { context: response.context };

    } catch (error) {
        // If content script not injected, try to inject it
        if (error.message.includes('Receiving end does not exist')) {
            return {
                context: {
                    type: 'unknown',
                    message: 'Could not analyze this page'
                }
            };
        }
        throw error;
    }
}

// ============================================================
// Find Deals Handler (Main Agent Loop)
// ============================================================

async function handleFindDeals(payload) {
    const { decision_spec, context } = payload;

    agentState.decisionSpec = decision_spec;
    agentState.context = context;
    agentState.lastRun = new Date().toISOString();

    try {
        // Step 1: Gather candidates from multiple sources
        console.log('[Agent] Step 1: Gathering candidates...');
        const candidates = await gatherCandidates(decision_spec.query);
        agentState.candidates = candidates;

        if (candidates.length === 0) {
            return {
                ranked: [],
                message: 'No candidates found'
            };
        }

        // Step 2: Rank candidates via server
        console.log('[Agent] Step 2: Ranking candidates...');
        const ranked = await rankCandidates(decision_spec, context, candidates);
        agentState.ranked = ranked;

        return {
            ranked,
            total_candidates: candidates.length
        };

    } catch (error) {
        console.error('[Agent] Error in agent loop:', error);
        throw error;
    }
}

// ============================================================
// Candidate Gathering
// ============================================================

async function gatherCandidates(query) {
    const allCandidates = [];

    // Source 1: eBay API (via server)
    try {
        console.log('[Agent] Fetching eBay candidates...');
        const ebayResults = await fetchEbayCandidates(query);
        allCandidates.push(...ebayResults);
        console.log(`[Agent] Got ${ebayResults.length} eBay candidates`);
    } catch (error) {
        console.error('[Agent] eBay fetch failed:', error);
    }

    // Source 2: Newegg (via content script scraping)
    try {
        console.log('[Agent] Fetching Newegg candidates...');
        const neweggResults = await fetchNeweggCandidates(query);
        allCandidates.push(...neweggResults);
        console.log(`[Agent] Got ${neweggResults.length} Newegg candidates`);
    } catch (error) {
        console.error('[Agent] Newegg fetch failed:', error);
    }

    return allCandidates;
}

async function fetchEbayCandidates(query) {
    try {
        const response = await fetch(`${SERVER_URL}/search/ebay`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, max_results: 15 })
        });

        if (!response.ok) {
            throw new Error(`eBay API error: ${response.status}`);
        }

        const data = await response.json();
        return data.listings || [];
    } catch (error) {
        console.error('[Agent] eBay API error:', error);
        return [];
    }
}

async function fetchNeweggCandidates(query) {
    try {
        // Open a background tab to Newegg search
        const searchUrl = NEWEGG_SEARCH_URL + encodeURIComponent(query);

        const tab = await chrome.tabs.create({
            url: searchUrl,
            active: false
        });

        // Wait for page to load
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Request scraping from content script
        const response = await chrome.tabs.sendMessage(tab.id, {
            type: 'SCRAPE_SEARCH_RESULTS',
            payload: { source: 'newegg' }
        });

        // Close the tab
        await chrome.tabs.remove(tab.id);

        if (response.error) {
            throw new Error(response.error);
        }

        return response.listings || [];

    } catch (error) {
        console.error('[Agent] Newegg scraping error:', error);
        return [];
    }
}

// ============================================================
// Ranking
// ============================================================

async function rankCandidates(decisionSpec, context, candidates) {
    try {
        const response = await fetch(`${SERVER_URL}/rank`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                decision_spec: decisionSpec,
                context: context,
                candidates: candidates
            })
        });

        if (!response.ok) {
            throw new Error(`Ranking server error: ${response.status}`);
        }

        const data = await response.json();
        return data.ranked || [];

    } catch (error) {
        console.error('[Agent] Ranking error:', error);
        // Fallback: return candidates sorted by price
        return candidates
            .sort((a, b) => (a.price?.value || 0) - (b.price?.value || 0))
            .slice(0, 10)
            .map(listing => ({
                listing,
                score_total: 0.5,
                score_breakdown: {},
                explanation_bullets: ['Ranking unavailable - sorted by price']
            }));
    }
}

// ============================================================
// Compare Top 3
// ============================================================

async function handleCompareTop3(payload) {
    const { results } = payload;

    if (!results || results.length === 0) {
        throw new Error('No results to compare');
    }

    const top3 = results.slice(0, 3);
    const tabIds = [];

    // Create tabs for each result
    for (const result of top3) {
        const listing = result.listing || result;
        const url = listing.url;

        if (!url) continue;

        const tab = await chrome.tabs.create({
            url: url,
            active: false
        });
        tabIds.push(tab.id);
    }

    // Group tabs together
    if (tabIds.length > 0) {
        try {
            const groupId = await chrome.tabs.group({ tabIds });
            await chrome.tabGroups.update(groupId, {
                title: 'Agentic Shopper',
                color: 'purple',
                collapsed: false
            });

            // Wait for pages to load then inject highlights
            setTimeout(async () => {
                for (let i = 0; i < tabIds.length; i++) {
                    try {
                        const result = top3[i];
                        await chrome.tabs.sendMessage(tabIds[i], {
                            type: 'HIGHLIGHT_ELEMENTS',
                            payload: {
                                score: result.score_total,
                                bullets: result.explanation_bullets
                            }
                        });
                    } catch (e) {
                        console.log('[Agent] Could not inject highlights:', e.message);
                    }
                }
            }, 2000);

        } catch (e) {
            console.log('[Agent] Tab grouping failed:', e.message);
        }
    }

    // Activate first tab
    if (tabIds.length > 0) {
        await chrome.tabs.update(tabIds[0], { active: true });
    }

    return { success: true, tabs_opened: tabIds.length };
}

// ============================================================
// Preferences Storage
// ============================================================

async function getStoredPreferences() {
    const result = await chrome.storage.local.get('preferences');
    return result.preferences || null;
}

async function savePreferences(prefs) {
    await chrome.storage.local.set({ preferences: prefs });
    return { success: true };
}

// ============================================================
// Installation Handler
// ============================================================

chrome.runtime.onInstalled.addListener((details) => {
    console.log('[Agentic Shopper] Extension installed:', details.reason);

    // Set default preferences
    chrome.storage.local.get('preferences', (result) => {
        if (!result.preferences) {
            chrome.storage.local.set({
                preferences: {
                    budget_max: 250,
                    condition_allowed: ['new', 'refurb'],
                    delivery_priority: 'med',
                    risk_tolerance: 'med',
                    weights: {
                        price: 0.25,
                        delivery: 0.20,
                        reliability: 0.25,
                        returns: 0.15,
                        spec_match: 0.15
                    }
                }
            });
        }
    });
});
