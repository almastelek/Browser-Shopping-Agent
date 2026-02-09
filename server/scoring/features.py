"""
Feature scoring functions for ranking candidates.
Each component returns a score in [0, 1].
"""
import math
from storage.models import Listing, DecisionSpec, Priority


def score_price(listing: Listing, spec: DecisionSpec) -> float:
    """
    Score based on price relative to budget.
    
    - If price missing -> 0.2
    - If price > budget -> 0.0
    - Otherwise -> scaled score (closer to 0 = better)
    """
    price = listing.price.value
    
    if price <= 0:
        return 0.2  # Unknown price
    
    budget = spec.budget_max
    
    if price > budget:
        # Over budget - penalize based on how far over
        overage_ratio = (price - budget) / budget
        return max(0, 0.3 - overage_ratio * 0.3)
    
    # Under budget - "Sweet Spot" logic
    ratio = price / budget
    
    if ratio < 0.4:
        # TOO CHEAP: Likely a lower tier or accessory. Penalize.
        score = 0.3 + (ratio * 0.75) # 0.3 -> 0.6
    elif ratio < 0.8:
        # GOOD VALUE: 40% to 80% of budget.
        score = 0.6 + (ratio - 0.4) * 0.75 # 0.6 -> 0.9
    elif ratio <= 0.95:
        # SWEET SPOT: 80% to 95% of budget. High quality, close to target tier.
        score = 0.9 + (ratio - 0.8) * 0.66 # 0.9 -> 1.0
    else:
        # NEAR MAX: 95% to 100% of budget.
        score = 1.0 - (ratio - 0.95) * 2.0 # 1.0 -> 0.9
        
    return min(1.0, max(0.0, score))


def score_delivery(listing: Listing, spec: DecisionSpec) -> float:
    """
    Score based on estimated delivery time.
    
    - 1-2 days -> 1.0
    - 3-5 days -> 0.7-0.8
    - 6-7 days -> 0.5
    - 8+ days -> 0.2-0.4
    - Unknown -> 0.3
    
    Adjusted based on delivery_priority.
    """
    eta = listing.shipping.eta_days
    
    if eta is None:
        return 0.3  # Unknown delivery
    
    # Base score mapping
    if eta <= 2:
        base_score = 1.0
    elif eta <= 3:
        base_score = 0.85
    elif eta <= 5:
        base_score = 0.7
    elif eta <= 7:
        base_score = 0.5
    elif eta <= 10:
        base_score = 0.35
    else:
        base_score = 0.2
    
    # Adjust based on priority
    if spec.delivery_priority == Priority.HIGH:
        # High priority: penalize slow delivery more
        if eta > 5:
            base_score *= 0.7
    elif spec.delivery_priority == Priority.LOW:
        # Low priority: less penalty for slow delivery
        base_score = max(base_score, 0.5)
    
    # Bonus for free shipping
    if listing.shipping.cost == 0:
        base_score = min(1.0, base_score + 0.1)
    
    return min(1.0, max(0.0, base_score))


def score_reliability(listing: Listing, spec: DecisionSpec) -> float:
    """
    Score based on seller rating and review count.
    
    CRITICAL: Enforces a 'Quality Floor'
    """
    seller = listing.seller
    
    # Unknown seller is now suspicious by default for high-quality requests
    base_score = 0.2
    
    if seller.rating is not None:
        # Rating is 0-100
        rating_score = seller.rating / 100
        
        # AGGRESSIVE QUALITY FLOOR: 
        # Anything below 95% gets penalized heavily
        if seller.rating < 90:
            rating_score *= 0.3
        elif seller.rating < 95:
            rating_score *= 0.7
            
        # Review count modifier (log scale)
        if seller.reviews and seller.reviews > 0:
            # log10(10)=1, log10(100)=2, log10(1000)=3, log10(10000)=4
            # We want high confidence at 100+ reviews
            review_modifier = min(1.0, (math.log10(seller.reviews + 1) / 3))
            
            # If reviews < 20, it's considered low confidence
            if seller.reviews < 20:
                review_modifier *= 0.5
                
            base_score = rating_score * 0.7 + review_modifier * 0.3
        else:
            # No reviews - very low confidence
            base_score = rating_score * 0.4
    
    # Official store bonus
    if seller.is_official:
        base_score = min(1.0, base_score + 0.3) # Significant boost
    
    # Adjust based on risk tolerance
    if spec.risk_tolerance == Priority.HIGH:
        # User wants 'High' quality/reliability (low risk tolerance IRL)
        # Note: The extension mapping for risk_tolerance was confusing, 
        # but User said they want high quality.
        if base_score < 0.6:
            base_score *= 0.5 # Crush low-quality items
    
    return min(1.0, max(0.0, base_score))


def score_returns(listing: Listing, spec: DecisionSpec) -> float:
    """
    Score based on return policy.
    
    - 30+ days -> 1.0
    - 14-29 days -> 0.7
    - 7-13 days -> 0.5
    - 1-6 days -> 0.3
    - No returns -> 0.1
    - Unknown -> 0.35
    """
    returns = listing.returns
    
    if returns.unknown and returns.window_days is None:
        return 0.35  # Unknown
    
    if returns.available is False:
        return 0.1  # No returns
    
    window = returns.window_days
    
    if window is None:
        return 0.4  # Returns available but window unknown
    
    if window >= 30:
        return 1.0
    elif window >= 14:
        return 0.7
    elif window >= 7:
        return 0.5
    elif window >= 1:
        return 0.3
    else:
        return 0.2


def score_spec_match(listing: Listing, spec: DecisionSpec) -> float:
    """
    Score based on keyword and brand matching.
    
    - +0.2 per required keyword present (up to 1.0)
    - Banned keyword present -> 0.0
    - Brand whitelist/blacklist bonuses
    - Model match bonus
    """
    score = 0.5  # Base score
    
    title_lower = listing.title.lower()
    key_terms = [t.lower() for t in listing.specs.key_terms]
    brand = (listing.specs.brand or "").lower()
    
    # Check banned keywords first
    for banned in spec.banned_keywords:
        if banned.lower() in title_lower or banned.lower() in key_terms:
            return 0.0  # Instant disqualification
    
    # Required keywords
    for required in spec.required_keywords:
        if required.lower() in title_lower:
            score += 0.2
    
    # Brand whitelist
    for whitelist_brand in spec.brand_whitelist:
        if whitelist_brand.lower() in brand or whitelist_brand.lower() in title_lower:
            score += 0.2
            break
    
    # Brand blacklist
    for blacklist_brand in spec.brand_blacklist:
        if blacklist_brand.lower() in brand or blacklist_brand.lower() in title_lower:
            score -= 0.3
            break
    
    # Query term matching
    if spec.query:
        query_terms = spec.query.lower().split()
        matches = sum(1 for term in query_terms if term in title_lower)
        match_ratio = matches / len(query_terms) if query_terms else 0
        score += match_ratio * 0.4

        # Quality-specific signal boost
        quality_terms = ['high quality', 'premium', 'official', 'pro', 'authentic']
        query_contains_quality = any(q in spec.query.lower() for q in quality_terms)
        if query_contains_quality:
            # Boost if listing title also contains quality terms
            if any(q in title_lower for q in quality_terms):
                score += 0.2
            # Boost if official store
            if listing.seller.is_official:
                score += 0.1
    
    return min(1.0, max(0.0, score))
