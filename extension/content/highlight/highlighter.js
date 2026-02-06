/**
 * Element Highlighter for Agentic Shopper
 * Highlights price, shipping, and returns elements on product pages
 */

const AgenticHighlighter = {
    // CSS class prefix
    PREFIX: 'agentic-highlight',

    // Overlay element reference
    overlayElement: null,

    /**
     * Find and highlight important elements on the page
     */
    highlight() {
        // Remove existing highlights first
        this.clearHighlights();

        // Highlight price
        this.highlightPrice();

        // Highlight shipping/delivery
        this.highlightShipping();

        // Highlight returns
        this.highlightReturns();
    },

    /**
     * Clear all existing highlights
     */
    clearHighlights() {
        document.querySelectorAll(`.${this.PREFIX}`).forEach(el => {
            el.classList.remove(this.PREFIX, `${this.PREFIX}--price`,
                `${this.PREFIX}--shipping`, `${this.PREFIX}--returns`);
        });

        // Remove overlay if exists
        if (this.overlayElement) {
            this.overlayElement.remove();
            this.overlayElement = null;
        }
    },

    /**
     * Highlight price elements
     */
    highlightPrice() {
        const priceSelectors = [
            '[itemprop="price"]',
            '#priceblock_ourprice',
            '#priceblock_dealprice',
            '.price-current',
            '.x-price-primary',
            '[data-testid="x-price-primary"]',
            '.product-price',
            '.sale-price',
            '.offer-price',
            '[class*="price"]:not([class*="was"]):not([class*="old"]):not([class*="compare"])',
        ];

        for (const selector of priceSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                // Check if it looks like a real price (has $ and numbers)
                const text = el.textContent || '';
                if (text.match(/\$[\d,]+/)) {
                    el.classList.add(this.PREFIX, `${this.PREFIX}--price`);
                    return; // Only highlight first match
                }
            }
        }
    },

    /**
     * Highlight shipping/delivery elements
     */
    highlightShipping() {
        const shippingSelectors = [
            '#delivery-message',
            '#deliveryBlockMessage',
            '.shipping-price',
            '.delivery-message',
            '[class*="shipping"]',
            '[class*="delivery"]',
            '[data-testid*="delivery"]',
            '[data-testid*="shipping"]',
        ];

        // Also search by text content
        const shippingKeywords = ['delivery', 'shipping', 'arrives', 'get it by', 'free delivery'];

        // Try selectors first
        for (const selector of shippingSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = (el.textContent || '').toLowerCase();
                    if (shippingKeywords.some(kw => text.includes(kw))) {
                        el.classList.add(this.PREFIX, `${this.PREFIX}--shipping`);
                        return;
                    }
                }
            } catch (e) {
                // Invalid selector
            }
        }

        // Fallback: search all elements
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_ELEMENT,
            null,
            false
        );

        while (walker.nextNode()) {
            const el = walker.currentNode;
            const text = (el.textContent || '').toLowerCase();

            // Check if element contains shipping keywords and is reasonably sized
            if (shippingKeywords.some(kw => text.includes(kw))) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 50 && rect.height > 10 && rect.height < 200) {
                    // Check if it's not a huge container
                    if (text.length < 200) {
                        el.classList.add(this.PREFIX, `${this.PREFIX}--shipping`);
                        return;
                    }
                }
            }
        }
    },

    /**
     * Highlight returns/refund policy elements
     */
    highlightReturns() {
        const returnsSelectors = [
            '[class*="return"]',
            '[class*="refund"]',
            '[data-testid*="return"]',
            '.return-policy',
            '#return-policy',
        ];

        const returnsKeywords = ['return', 'refund', 'money back', 'hassle-free'];

        // Try selectors first
        for (const selector of returnsSelectors) {
            try {
                const elements = document.querySelectorAll(selector);
                for (const el of elements) {
                    const text = (el.textContent || '').toLowerCase();
                    if (returnsKeywords.some(kw => text.includes(kw))) {
                        el.classList.add(this.PREFIX, `${this.PREFIX}--returns`);
                        return;
                    }
                }
            } catch (e) {
                // Invalid selector
            }
        }

        // Fallback: search by text
        const allElements = document.querySelectorAll('p, span, div, a');
        for (const el of allElements) {
            const text = (el.textContent || '').toLowerCase();
            if (text.length < 100 && returnsKeywords.some(kw => text.includes(kw))) {
                const rect = el.getBoundingClientRect();
                if (rect.width > 30 && rect.height > 10) {
                    el.classList.add(this.PREFIX, `${this.PREFIX}--returns`);
                    return;
                }
            }
        }
    },

    /**
     * Inject floating overlay with agent score
     */
    injectOverlay(data) {
        // Remove existing overlay
        if (this.overlayElement) {
            this.overlayElement.remove();
        }

        const overlay = document.createElement('div');
        overlay.id = 'agentic-shopper-overlay';
        overlay.innerHTML = `
      <div class="agentic-overlay-header">
        <span class="agentic-overlay-logo">🛒 Agent</span>
        <button class="agentic-overlay-close" onclick="this.closest('#agentic-shopper-overlay').remove()">×</button>
      </div>
      <div class="agentic-overlay-score">
        <span class="score-value">${Math.round((data.score || 0) * 100)}</span>
        <span class="score-label">/ 100</span>
      </div>
      <ul class="agentic-overlay-bullets">
        ${(data.bullets || []).map(b => {
            const text = typeof b === 'string' ? b : b.text;
            return `<li>${this.escapeHtml(text)}</li>`;
        }).join('')}
      </ul>
    `;

        document.body.appendChild(overlay);
        this.overlayElement = overlay;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }
};

// Expose to global scope
window.AgenticHighlighter = AgenticHighlighter;
