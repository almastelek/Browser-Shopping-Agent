from storage.models import (
    Listing, DecisionSpec, RankedListing, ScoreBreakdown, PageContext,
    Condition
)
import re
import statistics

# Terms that often indicate an accessory rather than the main product
ACCESSORY_TERMS = [
    "case", "cover", "protector", "strap", "band", "replacement", 
    "parts", "box only", "empty box", "manual", "compatible", 
    "fits", "charger", "cable", "adapter", "refill", "cartridge",
    "pouch", "sleeve", "mount", "stand", "battery"
]
from .features import (
    score_price,
    score_delivery,
    score_reliability,
    score_returns,
    score_spec_match
)
from .explain import generate_explanations

def rank_candidates(
    candidates: list[Listing],
    spec: DecisionSpec,
    context: PageContext | None = None
) -> tuple[list[RankedListing], int]:
    """
    Rank candidates according to decision spec.
    
    Returns:
        Tuple of (ranked listings, number filtered out)
    """
    # Normalize weights
    weights = spec.weights.normalized()
    
    # 1. Detect query specificity
    is_specific = is_specific_query(spec.query)
    
    # 2. Filter candidates
    filtered, filtered_count = filter_candidates(candidates, spec, is_specific)
    
    # 3. Compute Median Price for outlier detection (Exclude garbage matches first)
    decent_matches = [c for c in filtered if compute_score_breakdown(c, spec).spec_match > 0.4]
    median_price = compute_median_price(decent_matches)
    
    # 4. Score each candidate
    scored = []
    for listing in filtered:
        breakdown = compute_score_breakdown(listing, spec)
        
        # 5. Apply Match Quality Gating
        total = compute_total_score(breakdown, weights)
        
        # SEARCH MODE ADJUSTMENTS
        search_mode = spec.search_mode if hasattr(spec, 'search_mode') else 'same'
        
        # Accessory Risk Penalty
        if is_accessory(listing.title) and not is_accessory(spec.query):
            total *= 0.3
            breakdown.spec_match *= 0.1
            
        # Match Quality Gate
        if is_specific:
            threshold = 0.55 if search_mode == 'same' else 0.45
            if breakdown.spec_match < threshold:
                total *= 0.50
        else:
            threshold = 0.70 if search_mode == 'same' else 0.60
            if breakdown.spec_match < threshold:
                total *= 0.35
                
        # Price Outlier Penalty (Too cheap to be real product)
        outlier_threshold = 0.35 if search_mode == 'same' else 0.25
        if median_price and listing.price.value < (outlier_threshold * median_price):
            if breakdown.spec_match < 0.85:
                # Unless it's a near-perfect match, penalize suspiciously cheap items
                total *= 0.7
        
        explanations = generate_explanations(listing, spec, breakdown, is_specific)
        
        scored.append(RankedListing(
            listing=listing,
            score_total=total,
            score_breakdown=breakdown,
            explanation_bullets=explanations
        ))
    
    # 6. QUALITY-FIRST SORTING: (Match Bucket, Total Score)
    scored.sort(
        key=lambda x: (get_match_bucket(x.score_breakdown.spec_match), x.score_total), 
        reverse=True
    )
    
    # 7. APPLY SOURCE DIVERSITY BOOST
    final_ranked = apply_source_diversity(scored)
    
    return final_ranked, filtered_count


def is_specific_query(query: str) -> bool:
    """Detects if query is a specific model/brand query vs broad category."""
    tokens = re.findall(r'\w+', query.lower())
    meaningful_tokens = [t for t in tokens if len(t) > 2]
    
    if len(meaningful_tokens) >= 5:
        return True
        
    # Check for model-like tokens (alphanumeric mixtures)
    for token in tokens:
        if any(c.isdigit() for c in token) and any(c.isalpha() for c in token):
            return True
            
    return False


def get_match_bucket(spec_match: float) -> int:
    """Buckets for quality-first sorting."""
    if spec_match >= 0.80: return 3
    if spec_match >= 0.65: return 2
    if spec_match >= 0.50: return 1
    return 0


def compute_median_price(candidates: list[Listing]) -> float | None:
    prices = [c.price.value for c in candidates if c.price.value > 0]
    if not prices:
        return None
    return statistics.median(prices)


def is_accessory(text: str) -> bool:
    text_lower = text.lower()
    return any(term in text_lower for term in ACCESSORY_TERMS)


def apply_source_diversity(ranked: list[RankedListing]) -> list[RankedListing]:
    """ Ensures top results aren't dominated by a single source if others are available. """
    if len(ranked) < 2:
        return ranked
        
    first_source = ranked[0].listing.source
    
    # If the first two items are from the same source, try to find a different source for #2
    if ranked[1].listing.source == first_source:
        for i in range(2, len(ranked)):
            if ranked[i].listing.source != first_source:
                # Diversity Guard: Only promote if match is solid
                if ranked[i].score_breakdown.spec_match > 0.60:
                    diverse_item = ranked.pop(i)
                    ranked.insert(1, diverse_item)
                    break
    
    # If we still have only one source in top 2, try to find a third source for #3
    sources_in_top2 = {r.listing.source for r in ranked[:2]}
    if len(ranked) >= 3 and ranked[2].listing.source in sources_in_top2:
        for i in range(3, len(ranked)):
            if ranked[i].listing.source not in sources_in_top2:
                if ranked[i].score_breakdown.spec_match > 0.50:
                    diverse_item = ranked.pop(i)
                    ranked.insert(2, diverse_item)
                    break
                    
    return ranked


def filter_candidates(
    candidates: list[Listing],
    spec: DecisionSpec,
    is_specific: bool = False
) -> tuple[list[Listing], int]:
    """
    Apply hard filters to remove ineligible candidates.
    """
    original_count = len(candidates)
    filtered = []
    
    query_is_acc = is_accessory(spec.query)
    
    for listing in candidates:
        # 1. FIX CONDITION FILTER BUG
        condition = listing.condition
        if condition == Condition.UNKNOWN and Condition.NEW in spec.condition_allowed:
            pass # Keep it
        elif condition not in spec.condition_allowed:
            continue
        
        # 2. ACCESSORY FILTER (Broad Queries Only)
        if not is_specific and not query_is_acc:
            if is_accessory(listing.title):
                continue

        # Check banned keywords
        title_lower = listing.title.lower()
        banned = False
        for kw in spec.banned_keywords:
            if kw.lower() in title_lower:
                banned = True
                break
        if banned:
            continue
        
        # Check brand blacklist
        brand = (listing.specs.brand or "").lower()
        blacklisted = False
        for bl in spec.brand_blacklist:
            if bl.lower() in brand or bl.lower() in title_lower:
                blacklisted = True
                break
        if blacklisted:
            continue
        
        filtered.append(listing)
    
    return filtered, original_count - len(filtered)


def compute_score_breakdown(
    listing: Listing,
    spec: DecisionSpec
) -> ScoreBreakdown:
    """
    Compute individual component scores for a listing.
    """
    return ScoreBreakdown(
        price=score_price(listing, spec),
        delivery=score_delivery(listing, spec),
        reliability=score_reliability(listing, spec),
        returns=score_returns(listing, spec),
        spec_match=score_spec_match(listing, spec)
    )


def compute_total_score(
    breakdown: ScoreBreakdown,
    weights: "WeightConfig"  # Forward reference
) -> float:
    """
    Compute weighted total score from breakdown.
    """
    total = (
        breakdown.price * weights.price +
        breakdown.delivery * weights.delivery +
        breakdown.reliability * weights.reliability +
        breakdown.returns * weights.returns +
        breakdown.spec_match * weights.spec_match
    )
    
    return round(min(1.0, max(0.0, total)), 4)
