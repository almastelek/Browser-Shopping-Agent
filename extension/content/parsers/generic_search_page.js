/**
 * Generic Search Page Parser
 * Extracts search context and query terms from search/listing pages
 */

const GenericSearchParser = {
    /**
     * Extract search page context
     */
    extract() {
        const context = {
            type: 'unknown',
            url: window.location.href,
            source: this.detectSource(),
            timestamp: new Date().toISOString()
        };

        // Try to extract query
        const query = this.extractQuery();
        if (query) {
            context.type = 'search';
            context.query = query;
            context.keywords = query;
        }

        // Extract visible filters
        context.filters = this.extractFilters();

        // Count results if visible
        context.resultCount = this.extractResultCount();

        return context;
    },

    /**
     * Detect e-commerce source
     */
    detectSource() {
        const hostname = window.location.hostname.toLowerCase();

        if (hostname.includes('ebay')) return 'ebay';
        if (hostname.includes('newegg')) return 'newegg';
        if (hostname.includes('amazon')) return 'amazon';
        if (hostname.includes('bestbuy')) return 'bestbuy';

        return hostname.replace('www.', '').split('.')[0];
    },

    /**
     * Extract search query from page
     */
    extractQuery() {
        // Try URL parameters first
        const urlParams = new URLSearchParams(window.location.search);

        // Common query parameter names
        const queryParams = ['q', 'query', 'search', 'keyword', 'k', 'd', 's', 'searchTerm'];
        for (const param of queryParams) {
            const value = urlParams.get(param);
            if (value) {
                return decodeURIComponent(value);
            }
        }

        // Try search input fields
        const searchInputs = document.querySelectorAll(
            'input[type="search"], input[name*="search"], input[id*="search"], ' +
            'input[placeholder*="search"], input[aria-label*="search"]'
        );
        for (const input of searchInputs) {
            if (input.value?.trim()) {
                return input.value.trim();
            }
        }

        // Try extracting from H1 or page title
        const h1 = document.querySelector('h1');
        if (h1?.textContent) {
            const text = h1.textContent.trim();
            // Check if it looks like a search results header
            if (text.includes('results for') || text.includes('Search')) {
                const match = text.match(/results for [""']?(.+?)[""']?$/i);
                if (match) return match[1];
            }
        }

        // Extract from title
        const title = document.title;
        if (title) {
            // Patterns like "search results - eBay" or "Nike shoes | Newegg"
            const cleanTitle = title
                .replace(/\s*[-|–—]\s*.+$/, '')
                .replace(/^.*search.*:\s*/i, '')
                .replace(/^.*results.*:\s*/i, '')
                .trim();

            if (cleanTitle.length > 2 && cleanTitle.length < 100) {
                return cleanTitle;
            }
        }

        return null;
    },

    /**
     * Extract applied filters
     */
    extractFilters() {
        const filters = {};

        // Look for filter pills/tags
        const filterPills = document.querySelectorAll(
            '[class*="filter-pill"], [class*="filter-tag"], [class*="applied-filter"], ' +
            '[class*="refinement"], [data-refinement]'
        );

        filterPills.forEach(pill => {
            const text = pill.textContent?.trim();
            if (text && text.length < 50) {
                // Try to categorize
                if (text.includes('$') || text.match(/\d+-\d+/)) {
                    filters.price = text;
                } else if (text.toLowerCase().match(/new|used|refurb/)) {
                    filters.condition = text;
                } else if (text.toLowerCase().match(/brand|manufacturer/)) {
                    filters.brand = text;
                } else {
                    filters.other = filters.other || [];
                    filters.other.push(text);
                }
            }
        });

        // Check for price range
        const priceInputs = document.querySelectorAll('[name*="price"], [id*="price"]');
        priceInputs.forEach(input => {
            if (input.value) {
                if (input.name?.includes('min') || input.id?.includes('min')) {
                    filters.priceMin = parseFloat(input.value);
                } else if (input.name?.includes('max') || input.id?.includes('max')) {
                    filters.priceMax = parseFloat(input.value);
                }
            }
        });

        return Object.keys(filters).length > 0 ? filters : null;
    },

    /**
     * Extract result count
     */
    extractResultCount() {
        // Look for result count text
        const countPatterns = [
            /(\d[\d,]*)\s*results?/i,
            /showing\s*\d+\s*-?\s*\d*\s*of\s*(\d[\d,]*)/i,
            /(\d[\d,]*)\s*items?/i,
            /found\s*(\d[\d,]*)/i
        ];

        const textElements = document.querySelectorAll(
            '[class*="result"], [class*="count"], [class*="total"], ' +
            '[data-testid*="result"], h2, h3, .breadcrumb'
        );

        for (const el of textElements) {
            const text = el.textContent;
            for (const pattern of countPatterns) {
                const match = text.match(pattern);
                if (match) {
                    return parseInt(match[1].replace(/,/g, ''));
                }
            }
        }

        return null;
    },

    /**
     * Scrape individual search result listings
     */
    scrapeResults() {
        // Try common listing container selectors
        const listingSelectors = [
            '.srp-results .s-item',           // eBay
            '.item-cells-wrap .item-cell',    // Newegg
            '[data-testid="product-card"]',   // Generic
            '.product-card',
            '.search-result-item',
            '[class*="product-listing"]',
            '[class*="search-item"]'
        ];

        let listingElements = [];

        for (const selector of listingSelectors) {
            const elements = document.querySelectorAll(selector);
            if (elements.length > 0) {
                listingElements = Array.from(elements);
                break;
            }
        }

        // Parse each listing
        return listingElements.slice(0, 20).map((el, index) => {
            return this.parseListingElement(el, index);
        }).filter(l => l.title && l.url);
    },

    /**
     * Parse a single listing element
     */
    parseListingElement(el, index) {
        const listing = {
            id: `generic-${Date.now()}-${index}`,
            source: this.detectSource(),
            title: '',
            url: '',
            price: { value: 0, currency: 'USD' },
            condition: 'unknown',
            shipping: { cost: null, eta_days: null, method: 'unknown' },
            returns: { available: null, window_days: null, unknown: true },
            seller: { name: null, rating: null, reviews: null, is_official: null },
            specs: { brand: null, model: null, key_terms: [] },
            signals: { sponsored: false, low_stock: null },
            raw: { captured_at: new Date().toISOString(), notes: null }
        };

        // Title & URL
        const link = el.querySelector('a[href*="http"], a.item-title, a[class*="product"]');
        if (link) {
            listing.title = link.textContent?.trim() || el.querySelector('h3, h4, [class*="title"]')?.textContent?.trim();
            listing.url = link.href;
        }

        // Price
        const priceEl = el.querySelector('[class*="price"], .s-item__price');
        if (priceEl) {
            const priceText = priceEl.textContent;
            const match = priceText?.match(/\$?([\d,]+\.?\d*)/);
            if (match) {
                listing.price.value = parseFloat(match[1].replace(/,/g, ''));
            }
        }

        // Shipping
        const shippingEl = el.querySelector('[class*="shipping"], .s-item__shipping');
        if (shippingEl) {
            const text = shippingEl.textContent?.toLowerCase() || '';
            if (text.includes('free')) {
                listing.shipping.cost = 0;
            } else {
                const match = text.match(/\$([\d.]+)/);
                if (match) {
                    listing.shipping.cost = parseFloat(match[1]);
                }
            }
        }

        // Condition
        const conditionEl = el.querySelector('[class*="condition"]');
        if (conditionEl) {
            const text = conditionEl.textContent?.toLowerCase() || '';
            if (text.includes('new')) listing.condition = 'new';
            else if (text.includes('refurb')) listing.condition = 'refurb';
            else if (text.includes('used')) listing.condition = 'used';
        }

        // Sponsored
        const sponsored = el.textContent?.toLowerCase().includes('sponsored') ||
            el.querySelector('[class*="sponsored"]');
        listing.signals.sponsored = !!sponsored;

        // Image
        const img = el.querySelector('img[src*="http"]');
        if (img) {
            listing.image_url = img.src;
        }

        return listing;
    }
};

// Expose to global scope
window.GenericSearchParser = GenericSearchParser;
