/**
 * Normalized Listing Schema - shared across extension and server
 * All listings from any source are converted to this format
 */

const SOURCES = {
  EBAY: 'ebay',
  NEWEGG: 'newegg',
  MANUAL: 'manual'
};

const CONDITIONS = {
  NEW: 'new',
  REFURB: 'refurb',
  USED: 'used',
  UNKNOWN: 'unknown'
};

const SHIPPING_METHODS = {
  STANDARD: 'standard',
  EXPEDITED: 'expedited',
  UNKNOWN: 'unknown'
};

/**
 * Create a default/empty Listing object
 */
function createEmptyListing() {
  return {
    id: '',
    source: SOURCES.MANUAL,
    title: '',
    url: '',
    image_url: null,
    price: {
      value: 0,
      currency: 'USD'
    },
    condition: CONDITIONS.UNKNOWN,
    shipping: {
      cost: null,
      eta_days: null,
      method: SHIPPING_METHODS.UNKNOWN
    },
    returns: {
      available: null,
      window_days: null,
      unknown: true
    },
    seller: {
      name: null,
      rating: null,
      reviews: null,
      is_official: null
    },
    specs: {
      brand: null,
      model: null,
      key_terms: []
    },
    signals: {
      sponsored: false,
      low_stock: null
    },
    raw: {
      captured_at: new Date().toISOString(),
      notes: null
    }
  };
}

/**
 * Create a default DecisionSpec object
 */
function createDefaultDecisionSpec() {
  return {
    query: '',
    budget_max: 500,
    condition_allowed: [CONDITIONS.NEW, CONDITIONS.REFURB],
    delivery_priority: 'med',
    risk_tolerance: 'med',
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

/**
 * Validate that weights sum to 1.0
 */
function validateWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1.0) < 0.01;
}

/**
 * Normalize weights to sum to 1.0
 */
function normalizeWeights(weights) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  if (sum === 0) return weights;
  
  const normalized = {};
  for (const [key, value] of Object.entries(weights)) {
    normalized[key] = value / sum;
  }
  return normalized;
}

// Expose to global scope for content scripts
if (typeof window !== 'undefined') {
  window.AgenticSchema = {
    SOURCES,
    CONDITIONS,
    SHIPPING_METHODS,
    createEmptyListing,
    createDefaultDecisionSpec,
    validateWeights,
    normalizeWeights
  };
}
