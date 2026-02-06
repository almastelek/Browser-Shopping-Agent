/**
 * Generic Product Page Parser
 * Extracts product information from various e-commerce sites
 */

const GenericProductParser = {
    /**
     * Main extraction function
     */
    extract() {
        const context = {
            type: 'unknown',
            url: window.location.href,
            source: this.detectSource(),
            timestamp: new Date().toISOString()
        };

        // Try JSON-LD structured data first (most reliable)
        const jsonLdData = this.extractJsonLd();
        if (jsonLdData) {
            Object.assign(context, jsonLdData);
            context.type = 'product';
            return context;
        }

        // Try Open Graph / meta tags
        const metaData = this.extractMetaTags();
        if (metaData.title) {
            Object.assign(context, metaData);
        }

        // Try common selectors
        const domData = this.extractFromDom();
        if (domData.title || domData.price) {
            Object.assign(context, domData);
            context.type = 'product';
        }

        // Generate keywords
        context.keywords = this.generateKeywords(context);

        return context;
    },

    /**
     * Detect which e-commerce site we're on
     */
    detectSource() {
        const hostname = window.location.hostname.toLowerCase();

        if (hostname.includes('ebay')) return 'ebay';
        if (hostname.includes('newegg')) return 'newegg';
        if (hostname.includes('amazon')) return 'amazon';
        if (hostname.includes('bestbuy')) return 'bestbuy';
        if (hostname.includes('walmart')) return 'walmart';
        if (hostname.includes('target')) return 'target';

        return hostname.replace('www.', '').split('.')[0];
    },

    /**
     * Extract from JSON-LD structured data
     */
    extractJsonLd() {
        const scripts = document.querySelectorAll('script[type="application/ld+json"]');

        for (const script of scripts) {
            try {
                const data = JSON.parse(script.textContent);

                // Handle array of items
                const items = Array.isArray(data) ? data : [data];

                for (const item of items) {
                    // Check for Product type
                    if (item['@type'] === 'Product' || item['@type']?.includes('Product')) {
                        return this.parseJsonLdProduct(item);
                    }

                    // Check for nested @graph
                    if (item['@graph']) {
                        for (const graphItem of item['@graph']) {
                            if (graphItem['@type'] === 'Product') {
                                return this.parseJsonLdProduct(graphItem);
                            }
                        }
                    }
                }
            } catch (e) {
                // Invalid JSON, continue
            }
        }

        return null;
    },

    parseJsonLdProduct(product) {
        const result = {
            title: product.name,
            brand: product.brand?.name || product.brand,
            image: product.image?.[0] || product.image,
            description: product.description
        };

        // Extract offer/price info
        const offers = product.offers;
        if (offers) {
            const offer = Array.isArray(offers) ? offers[0] : offers;
            result.price = parseFloat(offer.price) || null;
            result.currency = offer.priceCurrency || 'USD';
            result.availability = offer.availability;
            result.condition = this.parseCondition(offer.itemCondition);
        }

        // Extract rating
        if (product.aggregateRating) {
            result.rating = parseFloat(product.aggregateRating.ratingValue);
            result.reviewCount = parseInt(product.aggregateRating.reviewCount);
        }

        return result;
    },

    /**
     * Extract from meta tags
     */
    extractMetaTags() {
        const result = {};

        // Open Graph
        result.title = this.getMetaContent('og:title');
        result.image = this.getMetaContent('og:image');
        result.description = this.getMetaContent('og:description');

        // Product-specific meta
        result.price = parseFloat(this.getMetaContent('product:price:amount')) || null;
        result.currency = this.getMetaContent('product:price:currency') || 'USD';
        result.brand = this.getMetaContent('product:brand');

        // Twitter cards
        if (!result.title) {
            result.title = this.getMetaContent('twitter:title');
        }

        return result;
    },

    getMetaContent(name) {
        const selector = `meta[property="${name}"], meta[name="${name}"]`;
        const meta = document.querySelector(selector);
        return meta?.content || null;
    },

    /**
     * Extract from DOM using common selectors
     */
    extractFromDom() {
        const result = {};

        // Title selectors
        const titleSelectors = [
            'h1[itemprop="name"]',
            '[data-testid="product-title"]',
            '.product-title h1',
            '.product-name h1',
            '#productTitle',
            'h1.product-title',
            '.pdp-title h1',
            'h1'
        ];
        result.title = this.getFirstText(titleSelectors);

        // Price selectors
        const priceSelectors = [
            '[itemprop="price"]',
            '[data-testid="product-price"]',
            '.product-price',
            '.price-current',
            '#priceblock_ourprice',
            '.main-price',
            '[class*="price"]:not([class*="was-price"]):not([class*="old-price"])',
            '.sale-price',
            '.now-price'
        ];
        const priceText = this.getFirstText(priceSelectors);
        result.price = this.parsePrice(priceText);

        // Shipping selectors
        const shippingSelectors = [
            '[data-testid="shipping-price"]',
            '.shipping-price',
            '#shipping-message',
            '[class*="shipping"]',
            '[class*="delivery"]'
        ];
        const shippingText = this.getFirstText(shippingSelectors);
        result.shippingText = shippingText;
        result.shippingCost = this.parsePrice(shippingText);
        if (shippingText?.toLowerCase().includes('free')) {
            result.shippingCost = 0;
        }

        // Brand
        const brandSelectors = [
            '[itemprop="brand"]',
            '.product-brand',
            '.brand-name',
            'a[href*="/brand/"]'
        ];
        result.brand = this.getFirstText(brandSelectors);

        // Condition
        const conditionSelectors = [
            '[itemprop="itemCondition"]',
            '.condition',
            '[class*="condition"]'
        ];
        const conditionText = this.getFirstText(conditionSelectors);
        result.condition = this.parseCondition(conditionText);

        return result;
    },

    getFirstText(selectors) {
        for (const selector of selectors) {
            try {
                const el = document.querySelector(selector);
                if (el) {
                    const text = el.textContent?.trim();
                    if (text && text.length < 500) {
                        return text;
                    }
                }
            } catch (e) {
                // Invalid selector
            }
        }
        return null;
    },

    parsePrice(text) {
        if (!text) return null;

        // Match price patterns like $123.45, 123.45, $1,234.56
        const match = text.match(/\$?\s*([\d,]+\.?\d*)/);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
        return null;
    },

    parseCondition(text) {
        if (!text) return 'unknown';

        const lower = text.toLowerCase();

        if (lower.includes('new')) return 'new';
        if (lower.includes('refurb') || lower.includes('renewed')) return 'refurb';
        if (lower.includes('used') || lower.includes('pre-owned')) return 'used';

        return 'unknown';
    },

    generateKeywords(context) {
        const parts = [];

        if (context.brand) parts.push(context.brand);
        if (context.title) {
            // Extract meaningful words from title
            const titleWords = context.title
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .slice(0, 6);
            parts.push(...titleWords);
        }

        // Dedupe and join
        return [...new Set(parts)].join(' ');
    }
};

// Expose to global scope
window.GenericProductParser = GenericProductParser;
