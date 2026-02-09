"""
Main ranking logic for Agentic Shopper.
Combines feature scores with weights to produce final rankings.
"""
from storage.models import (
    Listing, DecisionSpec, RankedListing, ScoreBreakdown, PageContext
)
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
    
    # Filter candidates
    filtered, filtered_count = filter_candidates(candidates, spec)
    
    # Score each candidate
    scored = []
    for listing in filtered:
        breakdown = compute_score_breakdown(listing, spec)
        total = compute_total_score(breakdown, weights)
        explanations = generate_explanations(listing, spec, breakdown)
        
        scored.append(RankedListing(
            listing=listing,
            score_total=total,
            score_breakdown=breakdown,
            explanation_bullets=explanations
        ))
    
    # Sort by total score (descending)
    scored.sort(key=lambda x: x.score_total, reverse=True)
    
    # APPLY SOURCE DIVERSITY BOOST
    # If top 3 are all from the same source, boost the next best from a different source
    final_ranked = apply_source_diversity(scored)
    
    return final_ranked, filtered_count


def apply_source_diversity(ranked: list[RankedListing]) -> list[RankedListing]:
    """ Ensures top results aren't dominated by a single source if others are available. """
    if len(ranked) < 2:
        return ranked
        
    first_source = ranked[0].listing.source
    
    # If the first two items are from the same source, try to find a different source for #2
    if ranked[1].listing.source == first_source:
        for i in range(2, len(ranked)):
            if ranked[i].listing.source != first_source:
                # We found a different source. 
                # If its score is reasonably close (e.g. > 0.6), move it up
                if ranked[i].score_total > 0.4:
                    diverse_item = ranked.pop(i)
                    ranked.insert(1, diverse_item)
                    break
    
    # If we still have only one source in top 2, try to find a third source for #3
    sources_in_top2 = {r.listing.source for r in ranked[:2]}
    if len(ranked) >= 3 and ranked[2].listing.source in sources_in_top2:
        for i in range(3, len(ranked)):
            if ranked[i].listing.source not in sources_in_top2:
                if ranked[i].score_total > 0.3:
                    diverse_item = ranked.pop(i)
                    ranked.insert(2, diverse_item)
                    break
                    
    return ranked


def filter_candidates(
    candidates: list[Listing],
    spec: DecisionSpec
) -> tuple[list[Listing], int]:
    """
    Apply hard filters to remove ineligible candidates.
    
    Returns:
        Tuple of (filtered list, count removed)
    """
    original_count = len(candidates)
    filtered = []
    
    for listing in candidates:
        # Check condition - Be lenient with 'unknown'
        # Treat 'unknown' as 'new' for filtering purposes if 'new' is allowed
        condition = listing.condition
        if condition == "unknown" and "new" in spec.condition_allowed:
            pass # Keep it
        elif condition not in spec.condition_allowed:
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
