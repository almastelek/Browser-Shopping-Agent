"""
Explanation generator for ranked listings.
Creates human-readable bullets explaining why each listing scored as it did.
"""
from storage.models import (
    Listing, DecisionSpec, ScoreBreakdown, ExplanationBullet
)


def generate_explanations(
    listing: Listing,
    spec: DecisionSpec,
    breakdown: ScoreBreakdown
) -> list[ExplanationBullet]:
    """
    Generate 2-3 explanation bullets for a listing.
    Focuses on strongest positive and negative factors.
    """
    bullets = []
    
    # Collect all factors with their scores and descriptions
    factors = []
    
    # Price factor
    price_value = listing.price.value
    if price_value > 0:
        if price_value <= spec.budget_max * 0.6:
            factors.append({
                "score": breakdown.price,
                "type": "positive",
                "text": f"Great price (${price_value:.0f} is {((1 - price_value/spec.budget_max)*100):.0f}% under budget)"
            })
        elif price_value <= spec.budget_max:
            factors.append({
                "score": breakdown.price,
                "type": "positive",
                "text": f"Within budget at ${price_value:.0f}"
            })
        else:
            over_pct = ((price_value - spec.budget_max) / spec.budget_max) * 100
            factors.append({
                "score": breakdown.price,
                "type": "negative",
                "text": f"Over budget (${price_value:.0f} is {over_pct:.0f}% above ${spec.budget_max:.0f})"
            })
    else:
        factors.append({
            "score": breakdown.price,
            "type": "neutral",
            "text": "Price not available"
        })
    
    # Delivery factor
    eta = listing.shipping.eta_days
    shipping_cost = listing.shipping.cost
    
    if eta is not None:
        if eta <= 2:
            factors.append({
                "score": breakdown.delivery,
                "type": "positive",
                "text": f"Fast delivery (~{eta} days)"
            })
        elif eta <= 5:
            factors.append({
                "score": breakdown.delivery,
                "type": "neutral",
                "text": f"Standard delivery ({eta} days)"
            })
        else:
            factors.append({
                "score": breakdown.delivery,
                "type": "negative",
                "text": f"Slow delivery ({eta}+ days)"
            })
    
    if shipping_cost == 0:
        factors.append({
            "score": 0.8,
            "type": "positive",
            "text": "Free shipping"
        })
    elif shipping_cost and shipping_cost > 10:
        factors.append({
            "score": 0.3,
            "type": "negative",
            "text": f"High shipping cost (${shipping_cost:.2f})"
        })
    
    # Reliability factor
    seller = listing.seller
    if seller.rating is not None:
        if seller.rating >= 98:
            factors.append({
                "score": breakdown.reliability,
                "type": "positive",
                "text": f"Top-rated seller ({seller.rating:.0f}%)"
            })
        elif seller.rating >= 95:
            factors.append({
                "score": breakdown.reliability,
                "type": "neutral",
                "text": f"Good seller rating ({seller.rating:.0f}%)"
            })
        elif seller.rating < 90:
            factors.append({
                "score": breakdown.reliability,
                "type": "negative",
                "text": f"Lower seller rating ({seller.rating:.0f}%)"
            })
        
        if seller.reviews and seller.reviews >= 1000:
            factors.append({
                "score": breakdown.reliability,
                "type": "positive",
                "text": f"Established seller ({seller.reviews:,} reviews)"
            })
    else:
        if breakdown.reliability < 0.5:
            factors.append({
                "score": breakdown.reliability,
                "type": "negative",
                "text": "Seller rating unknown"
            })
    
    if seller.is_official:
        factors.append({
            "score": breakdown.reliability,
            "type": "positive",
            "text": "Official brand store"
        })
    
    # Returns factor
    returns = listing.returns
    if returns.window_days:
        if returns.window_days >= 30:
            factors.append({
                "score": breakdown.returns,
                "type": "positive",
                "text": f"Long return window ({returns.window_days} days)"
            })
        elif returns.window_days < 14:
            factors.append({
                "score": breakdown.returns,
                "type": "negative",
                "text": f"Short return window ({returns.window_days} days)"
            })
    elif returns.available is False:
        factors.append({
            "score": breakdown.returns,
            "type": "negative",
            "text": "No returns accepted"
        })
    elif returns.unknown:
        factors.append({
            "score": breakdown.returns,
            "type": "neutral",
            "text": "Return policy unclear"
        })
    
    # Spec match factor
    if breakdown.spec_match >= 0.8:
        factors.append({
            "score": breakdown.spec_match,
            "type": "positive",
            "text": "Strong match for your search"
        })
    elif breakdown.spec_match < 0.4:
        factors.append({
            "score": breakdown.spec_match,
            "type": "negative",
            "text": "Partial match for your search"
        })
    
    # Custom Quality Explanation
    if "high quality" in spec.query.lower() or "premium" in spec.query.lower():
        if breakdown.spec_match > 0.7 and breakdown.reliability > 0.7:
            factors.append({
                "score": (breakdown.spec_match + breakdown.reliability) / 2,
                "type": "positive",
                "text": "High quality product from a reputable seller"
            })
    
    # Signals
    if listing.signals.sponsored:
        factors.append({
            "score": 0.5,
            "type": "neutral",
            "text": "Sponsored listing"
        })
    
    if listing.signals.low_stock:
        factors.append({
            "score": 0.5,
            "type": "neutral",
            "text": "Limited stock available"
        })
    
    # Sort by score (desc) and select top factors
    factors.sort(key=lambda x: abs(x["score"] - 0.5), reverse=True)
    
    # Pick 2-3 most impactful bullets (mix of positive/negative if available)
    positives = [f for f in factors if f["type"] == "positive"]
    negatives = [f for f in factors if f["type"] == "negative"]
    neutrals = [f for f in factors if f["type"] == "neutral"]
    
    selected = []
    
    # Add top positive
    if positives:
        selected.append(positives[0])
    
    # Add second positive or top negative
    if len(positives) > 1:
        selected.append(positives[1])
    elif negatives:
        selected.append(negatives[0])
    
    # Add third factor if we have room
    if len(selected) < 3:
        remaining = [f for f in factors if f not in selected]
        if remaining:
            selected.append(remaining[0])
    
    # Convert to ExplanationBullet objects
    for factor in selected[:3]:
        bullets.append(ExplanationBullet(
            text=factor["text"],
            type=factor["type"]
        ))
    
    return bullets
