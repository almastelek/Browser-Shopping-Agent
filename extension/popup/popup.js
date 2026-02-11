/**
 * Popup Script - Main UI logic for Agentic Shopper
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const analyzeBtn = document.getElementById('analyze-btn');
    const findDealsBtn = document.getElementById('find-deals-btn');
    const compareBtn = document.getElementById('compare-btn');
    const queryInput = document.getElementById('query-input');
    const budgetSlider = document.getElementById('budget-slider');
    const budgetValue = document.getElementById('budget-value');
    const statusBar = document.getElementById('status-bar');
    const statusText = document.getElementById('status-text');
    const contextSection = document.getElementById('context-section');
    const pageContext = document.getElementById('page-context');
    const resultsSection = document.getElementById('results-section');
    const resultsContainer = document.getElementById('results-container');
    const errorDisplay = document.getElementById('error-display');
    const errorMessage = document.getElementById('error-message');

    // State
    let currentContext = null;
    let rankedResults = [];
    let searchMode = 'same'; // 'same' or 'alt'

    // Initialize
    init();

    async function init() {
        await loadPreferences();
        setupEventListeners();
        setupCollapsibles();
    }

    function setupEventListeners() {
        // Budget slider
        budgetSlider.addEventListener('input', () => {
            budgetValue.textContent = budgetSlider.value;
        });

        // Analyze page button
        analyzeBtn.addEventListener('click', handleAnalyzePage);

        // Find deals button
        findDealsBtn.addEventListener('click', handleFindDeals);

        // Compare button
        compareBtn.addEventListener('click', handleCompareTop3);

        // Query input - trigger on Enter
        queryInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleFindDeals();
            }
        });

        // Search mode toggles
        document.querySelectorAll('#search-mode-toggle .toggle-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('#search-mode-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                searchMode = btn.dataset.mode;
                savePreferences();

                // If we already have a context, re-trigger smart analysis to update the query
                if (currentContext) {
                    console.log('[Agent] Search mode changed, re-analyzing...');
                    handleSmartAnalysisUpdate();
                }
            });
        });

        // Save preferences on change
        document.querySelectorAll('input, select').forEach(el => {
            el.addEventListener('change', savePreferences);
        });
    }

    function setupCollapsibles() {
        document.querySelectorAll('.section-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const section = toggle.closest('.collapsible');
                section.classList.toggle('collapsed');
            });
        });
    }

    // ============================================================
    // Preference Management
    // ============================================================

    async function loadPreferences() {
        try {
            const stored = await chrome.storage.local.get('preferences');
            if (stored.preferences) {
                const prefs = stored.preferences;

                if (prefs.budget_max) {
                    budgetSlider.value = prefs.budget_max;
                    budgetValue.textContent = prefs.budget_max;
                }

                if (prefs.condition_allowed) {
                    document.getElementById('cond-new').checked = prefs.condition_allowed.includes('new');
                    document.getElementById('cond-refurb').checked = prefs.condition_allowed.includes('refurb');
                    document.getElementById('cond-used').checked = prefs.condition_allowed.includes('used');
                }

                if (prefs.delivery_priority) {
                    document.getElementById('delivery-priority').value = prefs.delivery_priority;
                }

                if (prefs.risk_tolerance) {
                    document.getElementById('risk-tolerance').value = prefs.risk_tolerance;
                }

                if (prefs.query) {
                    queryInput.value = prefs.query;
                }

                if (prefs.search_mode) {
                    searchMode = prefs.search_mode;
                    document.querySelectorAll('#search-mode-toggle .toggle-btn').forEach(btn => {
                        if (btn.dataset.mode === searchMode) {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                }

                if (prefs.enabled_sources) {
                    document.getElementById('source-ebay').checked = prefs.enabled_sources.includes('ebay');
                }
            }
        } catch (error) {
            console.error('Error loading preferences:', error);
        }
    }

    async function savePreferences() {
        try {
            const prefs = buildDecisionSpec();
            await chrome.storage.local.set({ preferences: prefs });
        } catch (error) {
            console.error('Error saving preferences:', error);
        }
    }

    function buildDecisionSpec() {
        const conditions = [];
        if (document.getElementById('cond-new').checked) conditions.push('new');
        if (document.getElementById('cond-refurb').checked) conditions.push('refurb');
        if (document.getElementById('cond-used').checked) conditions.push('used');

        const enabledSources = ['google_shopping', 'newegg'];
        if (document.getElementById('source-ebay').checked) {
            enabledSources.push('ebay');
        }

        return {
            query: queryInput.value.trim(),
            budget_max: parseInt(budgetSlider.value, 10),
            condition_allowed: conditions,
            delivery_priority: document.getElementById('delivery-priority').value,
            risk_tolerance: document.getElementById('risk-tolerance').value,
            enabled_sources: enabledSources,
            search_mode: searchMode,
            required_keywords: [],
            banned_keywords: [],
            brand_whitelist: [],
            brand_blacklist: [],
            weights: {
                price: 0.15,
                delivery: 0.10,
                reliability: 0.35,
                returns: 0.10,
                spec_match: 0.30
            }
        };
    }

    // ============================================================
    // Action Handlers
    // ============================================================

    async function handleAnalyzePage() {
        showStatus('Analyzing current page...');
        hideError();

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ANALYZE_PAGE'
            });

            if (response.error) {
                throw new Error(response.error);
            }

            currentContext = response.context;
            displayContext(currentContext);

            await handleSmartAnalysisUpdate();
            hideStatus();
        } catch (error) {
            showError(error.message);
            hideStatus();
        }
    }

    async function handleSmartAnalysisUpdate() {
        if (!currentContext) return;

        showStatus('Agent is identifying product details...');
        try {
            const smartResponse = await chrome.runtime.sendMessage({
                type: 'SMART_ANALYZE',
                payload: {
                    context: currentContext,
                    search_mode: searchMode
                }
            });

            if (smartResponse && smartResponse.smart_data) {
                const smart = smartResponse.smart_data;
                // Auto-fill query with canonical name
                if (smart.canonical_query) {
                    queryInput.value = smart.canonical_query;
                }
                // Auto-fill budget
                if (smart.identity?.reference_price) {
                    budgetSlider.value = Math.min(2000, Math.max(10, Math.ceil(smart.identity.reference_price * 1.2)));
                    budgetValue.textContent = budgetSlider.value;
                }

                // Update context display with smart details
                if (smart.identity) {
                    currentContext.title = smart.identity.product_name || currentContext.title;
                    currentContext.price = smart.identity.reference_price || currentContext.price;
                    currentContext.type = smart.identity.category || 'product';
                    displayContext(currentContext);
                }

                // Add quality visual cue
                if (smart.is_high_quality_target) {
                    showStatus('Target identified as high-quality product.', 'success');
                    setTimeout(hideStatus, 2000);
                }

                savePreferences();
            }
        } catch (e) {
            console.error('[Agent] Smart analysis update failed:', e);
        }
    }

    async function handleFindDeals() {
        const query = queryInput.value.trim();
        if (!query) {
            showError('Please enter a search query');
            return;
        }

        showStatus('Searching for deals...');
        hideError();
        findDealsBtn.disabled = true;

        try {
            const decisionSpec = buildDecisionSpec();

            const response = await chrome.runtime.sendMessage({
                type: 'FIND_DEALS',
                payload: {
                    decision_spec: decisionSpec,
                    context: currentContext,
                    use_llm_rerank: true // Always use smart re-ranking now
                }
            });

            if (response.error) {
                throw new Error(response.error);
            }

            rankedResults = response.ranked || [];
            displayResults(rankedResults, response.llm_top_reason);

            hideStatus();
            resultsSection.classList.remove('hidden');
        } catch (error) {
            showError(error.message);
            hideStatus();
        } finally {
            findDealsBtn.disabled = false;
        }
    }

    async function handleCompareTop3() {
        if (rankedResults.length === 0) {
            showError('No results to compare');
            return;
        }

        showStatus('Opening comparison tabs...');
        hideError();
        compareBtn.disabled = true;

        try {
            const top3 = rankedResults.slice(0, 3);

            const response = await chrome.runtime.sendMessage({
                type: 'COMPARE_TOP3',
                payload: { results: top3 }
            });

            if (response.error) {
                throw new Error(response.error);
            }

            hideStatus();
        } catch (error) {
            showError(error.message);
            hideStatus();
        } finally {
            compareBtn.disabled = false;
        }
    }

    // ============================================================
    // UI Display Functions
    // ============================================================

    function displayContext(context) {
        if (!context || (context.type === 'unknown' && !context.title)) {
            pageContext.innerHTML = '<p class="placeholder">Could not extract context from this page</p>';
            return;
        }

        let html = '<div class="context-info">';

        if (context.title) {
            html += `<div class="title">${escapeHtml(context.title)}</div>`;
        }

        if (context.price) {
            html += `<div class="price">$${context.price.toFixed(2)}</div>`;
        }

        if (context.source) {
            html += `<div class="source">Source: ${context.source}</div>`;
        }

        if (context.keywords) {
            html += `<div class="keywords">Keywords: ${escapeHtml(context.keywords)}</div>`;
        }

        html += '</div>';
        pageContext.innerHTML = html;
    }

    function displayResults(results, topReason = null) {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p class="placeholder">No results found</p>';
            return;
        }

        let html = '';
        if (topReason) {
            html += `
                <div class="agent-reasoning">
                    <div class="reasoning-title">🛒 Agent's Top Choice Reasoning</div>
                    <div class="reasoning-text">${escapeHtml(topReason)}</div>
                </div>
            `;
        }

        html += results.slice(0, 5).map((result, index) =>
            createResultCard(result, index + 1)
        ).join('');

        resultsContainer.innerHTML = html;

        // Add click listeners to links to open in new tab explicitly
        resultsContainer.querySelectorAll('.result-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = link.dataset.url;
                if (url) {
                    chrome.tabs.create({ url: url });
                }
            });
        });
    }

    function createResultCard(result, rank) {
        const listing = result.listing || result;
        const scores = result.score_breakdown || {};
        const bullets = result.explanation_bullets || [];
        const totalScore = result.score_total !== undefined ? result.score_total : 0;

        const priceValue = listing.price?.value || listing.price || 0;
        const source = listing.source || 'unknown';
        const condition = listing.condition || 'unknown';

        return `
      <div class="result-card ${rank === 1 ? 'rank-1' : ''}">
        <div class="result-header">
          <span class="result-rank ${rank === 1 ? 'rank-1' : ''}">#${rank}</span>
          <span class="result-score">${(totalScore * 100).toFixed(0)}</span>
        </div>
        
        <div class="result-title">
          <a href="${escapeHtml(listing.url)}" class="result-link" data-url="${escapeHtml(listing.url)}">${escapeHtml(listing.title)}</a>
        </div>
        
        <div class="result-meta">
          <span class="result-price">$${priceValue.toFixed(2)}</span>
          <span class="result-source source-${source.replace(/_/g, '-')}">${source.replace(/_/g, ' ')}</span>
          <span class="result-condition">${condition}</span>
        </div>
        
        <div class="score-breakdown">
          ${createScoreBar('Price', scores.price)}
          ${createScoreBar('Delivery', scores.delivery)}
          ${createScoreBar('Trust', scores.reliability)}
          ${createScoreBar('Returns', scores.returns)}
          ${createScoreBar('Match', scores.spec_match)}
        </div>
        
        <ul class="explanation-bullets">
          ${bullets.map(b => `<li class="${b.type || ''}">${escapeHtml(b.text || b)}</li>`).join('')}
        </ul>
      </div>
    `;
    }

    function createScoreBar(label, value) {
        const score = value !== undefined ? value : 0;
        const percentage = (score * 100).toFixed(0);

        return `
      <div class="score-bar">
        <span class="score-bar-label">${label}</span>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width: ${percentage}%"></div>
        </div>
        <span class="score-bar-value">${percentage}</span>
      </div>
    `;
    }

    // ============================================================
    // Status & Error Display
    // ============================================================

    function showStatus(message) {
        statusText.textContent = message;
        statusBar.classList.remove('hidden');
    }

    function hideStatus() {
        statusBar.classList.add('hidden');
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorDisplay.classList.remove('hidden');
    }

    function hideError() {
        errorDisplay.classList.add('hidden');
    }

    // ============================================================
    // Utilities
    // ============================================================

    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
});
