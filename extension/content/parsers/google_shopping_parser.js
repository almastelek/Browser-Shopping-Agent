/**
 * Google Shopping Search Parser
 * Scrapes search results from Google Shopping
 */

const GoogleShoppingParser = {
    /**
     * Main scraping function
     */
    scrape() {
        const listings = [];
        // Google Shopping grid results
        const containers = document.querySelectorAll('.wOPJ9c, .sh-dgr__content, .sh-dlr__content, .sh-np__click-product, .pla-unit');

        console.log(`[Agentic Google] Found ${containers.length} potential containers`);

        containers.forEach((container, index) => {
            try {
                const listing = this.parseContainer(container);
                if (listing && listing.title && listing.price.value > 0) {
                    listing.id = `google-${index}-${Date.now()}`;
                    listings.push(listing);
                } else {
                    console.log(`[Agentic Google] Skipping invalid listing at index ${index}`, listing);
                }
            } catch (e) {
                console.error('[Agentic Google] Error parsing container:', e);
            }
        });

        return listings;
    },

    /**
     * Parse an individual result container
     */
    parseContainer(el) {
        const listing = {
            source: 'google_shopping',
            title: '',
            url: '',
            price: { value: 0, currency: 'USD' },
            condition: 'unknown',
            shipping: { cost: null, eta_days: null, method: 'unknown' },
            seller: { name: null, rating: null },
            specs: { brand: null, model: null },
            signals: { sponsored: false }
        };

        // Title - multiple possible classes
        const titleEl = el.querySelector('h3, .gkQHve, .SsM98d, .SaPmZ, .tAx70, .X87L0c');
        listing.title = titleEl?.innerText?.trim() || '';

        // Price - prioritize .lmQWe identified in inspection
        const priceEl = el.querySelector('.lmQWe, .a8pZ1e, .k68nU, .Xr8X9b, b, .OFF89e');
        if (priceEl) {
            const priceText = priceEl.innerText.trim();
            listing.price.value = this.parsePrice(priceText);
        } else {
            // Very aggressive price check
            const text = el.innerText;
            const priceMatch = text.match(/\$\s*([\d,]+\.?\d*)/);
            if (priceMatch) {
                listing.price.value = parseFloat(priceMatch[1].replace(/,/g, ''));
            }
        }

        // Seller
        const sellerEl = el.querySelector('.WJMUdc, .rw5ecc, .n7emVc, .WJMUdc, .aULzUe, .I96P7c');
        listing.seller.name = sellerEl?.innerText?.trim() || null;

        // URL - Be more specific to avoid help links
        const allLinks = Array.from(el.querySelectorAll('a'));
        const productLink = allLinks.find(a =>
            a.href &&
            !a.href.includes('support.google.com') &&
            !a.href.includes('google.com/googleshopping/answer') &&
            (a.href.includes('/shopping/product/') || a.href.includes('/url?url=') || a.querySelector('h3'))
        );

        if (productLink) {
            listing.url = productLink.href;
        } else if (allLinks.length > 0) {
            // Fallback to first non-support link
            const fallback = allLinks.find(a => !a.href.includes('support.google.com'));
            if (fallback) listing.url = fallback.href;
        }

        // Sponsored check
        if (el.innerText.toLowerCase().includes('sponsored') || el.innerText.toLowerCase().includes('ad')) {
            listing.signals.sponsored = true;
        }

        return listing;
    },

    parsePrice(text) {
        if (!text) return 0;
        const match = text.match(/\$?\s*([\d,]+\.?\d*)/);
        if (match) {
            return parseFloat(match[1].replace(/,/g, ''));
        }
        return 0;
    }
};

// Expose to global scope
window.GoogleShoppingParser = GoogleShoppingParser;
