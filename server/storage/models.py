"""
Pydantic models for Agentic Shopper.
Matches the extension's schema.js for consistency.
"""
from enum import Enum
from typing import Any
from datetime import datetime
from pydantic import BaseModel, Field


# ============================================================================
# Enums
# ============================================================================

class Source(str, Enum):
    """Data source identifiers."""
    EBAY = "ebay"
    NEWEGG = "newegg"
    GOOGLE_SHOPPING = "google_shopping"
    MANUAL = "manual"


class Condition(str, Enum):
    """Product condition types."""
    NEW = "new"
    REFURB = "refurb"
    USED = "used"
    UNKNOWN = "unknown"


class ShippingMethod(str, Enum):
    """Shipping method types."""
    STANDARD = "standard"
    EXPEDITED = "expedited"
    UNKNOWN = "unknown"


class Priority(str, Enum):
    """Priority levels."""
    LOW = "low"
    MED = "med"
    HIGH = "high"


# ============================================================================
# Listing Components
# ============================================================================

class Price(BaseModel):
    """Price information."""
    value: float = 0
    currency: str = "USD"


class Shipping(BaseModel):
    """Shipping information."""
    cost: float | None = None
    eta_days: int | None = None
    method: ShippingMethod = ShippingMethod.UNKNOWN


class Returns(BaseModel):
    """Return policy information."""
    available: bool | None = None
    window_days: int | None = None
    unknown: bool = True


class Seller(BaseModel):
    """Seller information."""
    name: str | None = None
    rating: float | None = None  # 0-100 scale
    reviews: int | None = None
    is_official: bool | None = None


class Specs(BaseModel):
    """Product specifications."""
    brand: str | None = None
    model: str | None = None
    key_terms: list[str] = Field(default_factory=list)


class Signals(BaseModel):
    """Additional listing signals."""
    sponsored: bool = False
    low_stock: bool | None = None


class RawData(BaseModel):
    """Raw capture data."""
    captured_at: str = Field(default_factory=lambda: datetime.now().isoformat())
    notes: str | None = None


# ============================================================================
# Main Listing Model
# ============================================================================

class Listing(BaseModel):
    """
    Normalized listing schema.
    Used across all sources for consistent processing.
    """
    id: str
    source: Source
    title: str
    url: str
    image_url: str | None = None
    price: Price = Field(default_factory=Price)
    condition: Condition = Condition.UNKNOWN
    shipping: Shipping = Field(default_factory=Shipping)
    returns: Returns = Field(default_factory=Returns)
    seller: Seller = Field(default_factory=Seller)
    specs: Specs = Field(default_factory=Specs)
    signals: Signals = Field(default_factory=Signals)
    raw: RawData = Field(default_factory=RawData)


# ============================================================================
# Decision Spec (User Preferences)
# ============================================================================

class WeightConfig(BaseModel):
    """Weight configuration for scoring dimensions."""
    price: float = Field(default=0.25, ge=0, le=1)
    delivery: float = Field(default=0.20, ge=0, le=1)
    reliability: float = Field(default=0.25, ge=0, le=1)
    returns: float = Field(default=0.15, ge=0, le=1)
    spec_match: float = Field(default=0.15, ge=0, le=1)

    def normalized(self) -> "WeightConfig":
        """Return a copy with weights normalized to sum to 1."""
        total = self.price + self.delivery + self.reliability + self.returns + self.spec_match
        if total == 0:
            return self
        return WeightConfig(
            price=self.price / total,
            delivery=self.delivery / total,
            reliability=self.reliability / total,
            returns=self.returns / total,
            spec_match=self.spec_match / total
        )


class DecisionSpec(BaseModel):
    """
    User's decision criteria for ranking.
    This is the input alongside candidates.
    """
    query: str = ""
    budget_max: float = Field(default=500, gt=0)
    condition_allowed: list[Condition] = Field(
        default=[Condition.NEW, Condition.REFURB]
    )
    delivery_priority: Priority = Priority.MED
    risk_tolerance: Priority = Priority.MED
    required_keywords: list[str] = Field(default_factory=list)
    banned_keywords: list[str] = Field(default_factory=list)
    brand_whitelist: list[str] = Field(default_factory=list)
    brand_blacklist: list[str] = Field(default_factory=list)
    weights: WeightConfig = Field(default_factory=WeightConfig)


# ============================================================================
# Scoring Results
# ============================================================================

class ScoreBreakdown(BaseModel):
    """Individual component scores."""
    price: float = Field(default=0, ge=0, le=1)
    delivery: float = Field(default=0, ge=0, le=1)
    reliability: float = Field(default=0, ge=0, le=1)
    returns: float = Field(default=0, ge=0, le=1)
    spec_match: float = Field(default=0, ge=0, le=1)


class ExplanationBullet(BaseModel):
    """A single explanation point."""
    text: str
    type: str = "neutral"  # positive, negative, neutral


class RankedListing(BaseModel):
    """A listing with computed scores and explanations."""
    listing: Listing
    score_total: float = Field(ge=0, le=1)
    score_breakdown: ScoreBreakdown
    explanation_bullets: list[ExplanationBullet]


# ============================================================================
# API Request/Response Models
# ============================================================================

class PageContext(BaseModel):
    """Context extracted from current page."""
    type: str = "unknown"
    url: str | None = None
    source: str | None = None
    title: str | None = None
    price: float | None = None
    keywords: str | None = None
    timestamp: str | None = None


class RankRequest(BaseModel):
    """Request to /rank endpoint."""
    decision_spec: DecisionSpec
    context: PageContext | None = None
    candidates: list[Listing]


class RankResponse(BaseModel):
    """Response from /rank endpoint."""
    ranked: list[RankedListing]
    total_candidates: int
    filtered_count: int = 0


class SearchRequest(BaseModel):
    """Request to search an external source."""
    query: str
    max_results: int = Field(default=15, ge=1, le=50)


class SearchResponse(BaseModel):
    """Response from search endpoint."""
    listings: list[Listing]
    source: str
    query: str
