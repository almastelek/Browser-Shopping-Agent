/**
 * Newegg Search Results Parser
 * Specialized scraper for Newegg search/listing pages
 */

const NeweggSearchParser = {
    /**
     * Scrape listings from Newegg search results
     */
    scrape() {
        const listings = [];

        // Newegg uses .item-cell for each product
        const itemCells = document.querySelectorAll('.item-cell, .item-container');

        // Fallback to different selectors
        const items = itemCells.length > 0
            ? itemCells
            : document.querySelectorAll('[class*="product-grid"] > div, .list-wrap .item');

        items.forEach((item, index) => {
            try {
                const listing = this.parseItem(item, index);
                if (listing.title && listing.url) {
                    listings.push(listing);
                }
            } catch (e) {
                console.error('[NeweggParser] Error parsing item:', e);
            }
        });

        return listings.slice(0, 20); // Limit to top 20
    },

    /**
     * Parse a single Newegg item element
     */
    parseItem(el, index) {
        const listing = {
            id: `newegg-${Date.now()}-${index}`,
            source: 'newegg',
            title: '',
            url: '',
            image_url: null,
            price: { value: 0, currency: 'USD' },
            condition: 'new', // Newegg defaults to new
            shipping: { cost: null, eta_days: null, method: 'unknown' },
            returns: { available: null, window_days: null, unknown: true },
            seller: { name: null, rating: null, reviews: null, is_official: null },
            specs: { brand: null, model: null, key_terms: [] },
            signals: { sponsored: false, low_stock: null },
            raw: { captured_at: new Date().toISOString(), notes: null }
        };

        // Title and URL
        const titleLink = el.querySelector('.item-title, a.item-title, a[title]');
        if (titleLink) {
            listing.title = titleLink.textContent?.trim() || titleLink.getAttribute('title');
            listing.url = titleLink.href;

            // Extract item ID from URL for unique ID
            const idMatch = listing.url.match(/\/p\/([^/?]+)/);
            if (idMatch) {
                listing.id = `newegg-${idMatch[1]}`;
            }
        }

        // Price - Newegg has various price structures
        const priceStrong = el.querySelector('.price-current strong');
        const priceSup = el.querySelector('.price-current sup');
        if (priceStrong) {
            const dollars = priceStrong.textContent?.replace(/[,$]/g, '') || '0';
            const cents = priceSup?.textContent?.replace(/\D/g, '') || '00';
            listing.price.value = parseFloat(`${dollars}.${cents}`);
        } else {
            // Fallback price parsing
            const priceEl = el.querySelector('.price-current, [class*="price"]');
            if (priceEl) {
                const priceText = priceEl.textContent || '';
                const match = priceText.match(/\$?([\d,]+)\.?(\d{0,2})/);
                if (match) {
                    listing.price.value = parseFloat(match[1].replace(/,/g, '') + '.' + (match[2] || '00'));
                }
            }
        }

        // Shipping
        const shippingEl = el.querySelector('.price-ship, [class*="shipping"]');
        if (shippingEl) {
            const shippingText = shippingEl.textContent?.toLowerCase() || '';
            if (shippingText.includes('free')) {
                listing.shipping.cost = 0;
            } else {
                const match = shippingText.match(/\$([\d.]+)/);
                if (match) {
                    listing.shipping.cost = parseFloat(match[1]);
                }
            }
        }

        // Rating & Reviews
        const ratingEl = el.querySelector('.item-rating, [class*="rating"]');
        if (ratingEl) {
            // Newegg uses aria-label for rating
            const ariaLabel = ratingEl.getAttribute('aria-label') || ratingEl.title;
            const ratingMatch = ariaLabel?.match(/([\d.]+)\s*out of\s*5/i);
            if (ratingMatch) {
                // Convert 5-star to 0-100 scale
                listing.seller.rating = (parseFloat(ratingMatch[1]) / 5) * 100;
            }
        }

        const reviewCountEl = el.querySelector('.item-rating-num, [class*="review-count"]');
        if (reviewCountEl) {
            const text = reviewCountEl.textContent || '';
            const match = text.match(/\(?\s*([\d,]+)\s*\)?/);
            if (match) {
                listing.seller.reviews = parseInt(match[1].replace(/,/g, ''));
            }
        }

        // Brand - extract from title or look for brand element
        const brandEl = el.querySelector('.item-brand img, [class*="brand"]');
        if (brandEl) {
            listing.specs.brand = brandEl.alt || brandEl.textContent?.trim();
        }
        if (!listing.specs.brand && listing.title) {
            // Try to get first word as brand
            const words = listing.title.split(/\s+/);
            if (words.length > 0) {
                listing.specs.brand = words[0];
            }
        }

        // Image
        const img = el.querySelector('.item-img img, img[src*="newegg"]');
        if (img) {
            listing.image_url = img.src || img.getAttribute('data-src');
        }

        // Promo/Sponsored detection
        const promoEl = el.querySelector('.item-promo, [class*="sponsored"]');
        if (promoEl) {
            const text = promoEl.textContent?.toLowerCase() || '';
            listing.signals.sponsored = text.includes('sponsored') || text.includes('ad');
        }

        // Stock status
        const stockEl = el.querySelector('[class*="stock"], .item-stock');
        if (stockEl) {
            const text = stockEl.textContent?.toLowerCase() || '';
            listing.signals.low_stock = text.includes('limited') || text.includes('few left');
        }

        // Extract key terms from title
        if (listing.title) {
            listing.specs.key_terms = listing.title
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(w => w.length > 2)
                .slice(0, 10);
        }

        // Newegg has a good return policy generally
        listing.returns.available = true;
        listing.returns.window_days = 30; // Standard Newegg policy

        return listing;
    },

    /**
     * Check if current page is a Newegg search page
     */
    isNeweggSearch() {
        const url = window.location.href.toLowerCase();
        return url.includes('newegg.com') &&
            (url.includes('/p/pl') || url.includes('/products/'));
    }
};

// Expose to global scope
window.NeweggSearchParser = NeweggSearchParser;
