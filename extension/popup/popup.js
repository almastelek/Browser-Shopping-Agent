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

        return {
            query: queryInput.value.trim(),
            budget_max: parseInt(budgetSlider.value, 10),
            condition_allowed: conditions,
            delivery_priority: document.getElementById('delivery-priority').value,
            risk_tolerance: document.getElementById('risk-tolerance').value,
            required_keywords: [],
            banned_keywords: [],
            brand_whitelist: [],
            brand_blacklist: [],
            weights: {
                price: 0.25,
                delivery: 0.20,
                reliability: 0.25,
                returns: 0.15,
                spec_match: 0.15
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

            // Auto-fill query if we extracted keywords
            if (currentContext.keywords && !queryInput.value) {
                queryInput.value = currentContext.keywords;
            }

            hideStatus();
        } catch (error) {
            showError(error.message);
            hideStatus();
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
                    context: currentContext
                }
            });

            if (response.error) {
                throw new Error(response.error);
            }

            rankedResults = response.ranked || [];
            displayResults(rankedResults);

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
        if (!context || context.type === 'unknown') {
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

    function displayResults(results) {
        if (!results || results.length === 0) {
            resultsContainer.innerHTML = '<p class="placeholder">No results found</p>';
            return;
        }

        resultsContainer.innerHTML = results.slice(0, 5).map((result, index) =>
            createResultCard(result, index + 1)
        ).join('');
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
          <a href="${escapeHtml(listing.url)}" target="_blank">${escapeHtml(listing.title)}</a>
        </div>
        
        <div class="result-meta">
          <span class="result-price">$${priceValue.toFixed(2)}</span>
          <span class="result-source">${source}</span>
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
