"""
eBay Browse API connector.
Adapted from Sourceror project with schema mapping.
"""
import httpx
import base64
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

from storage.models import (
    Listing, Source, Condition, ShippingMethod,
    Price, Shipping, Returns, Seller, Specs, Signals, RawData
)

# Load environment variables
load_dotenv()


class EbayConnector:
    """Connector for eBay Browse API."""
    
    BROWSE_API_URL = "https://api.ebay.com/buy/browse/v1"
    AUTH_URL = "https://api.ebay.com/identity/v1/oauth2/token"
    
    def __init__(self):
        self.client_id = os.getenv("EBAY_CLIENT_ID")
        self.client_secret = os.getenv("EBAY_CLIENT_SECRET")
        self._access_token: str | None = None
        self._token_expires: datetime | None = None
    
    @property
    def is_configured(self) -> bool:
        """Check if API credentials are configured."""
        return bool(self.client_id and self.client_secret)
    
    async def _get_access_token(self) -> str | None:
        """Get OAuth access token, refreshing if needed."""
        # Check if we have a valid cached token
        if self._access_token and self._token_expires:
            if datetime.now() < self._token_expires - timedelta(minutes=5):
                return self._access_token
        
        if not self.is_configured:
            print("[eBay] API credentials not configured")
            return None
        
        # Request new token
        credentials = f"{self.client_id}:{self.client_secret}"
        encoded_credentials = base64.b64encode(credentials.encode()).decode()
        
        headers = {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": f"Basic {encoded_credentials}",
        }
        data = {
            "grant_type": "client_credentials",
            "scope": "https://api.ebay.com/oauth/api_scope",
        }
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(
                    self.AUTH_URL,
                    headers=headers,
                    data=data
                )
                response.raise_for_status()
                token_data = response.json()
                
            self._access_token = token_data.get("access_token")
            expires_in = token_data.get("expires_in", 7200)
            self._token_expires = datetime.now() + timedelta(seconds=expires_in)
            
            return self._access_token
            
        except httpx.HTTPError as e:
            print(f"[eBay] OAuth error: {e}")
            return None
    
    def _parse_condition(self, item: dict) -> Condition:
        """Parse condition from eBay item data."""
        condition = item.get("condition", "")
        condition_id = item.get("conditionId", "")
        
        if isinstance(condition, dict):
            condition = condition.get("conditionDisplayName", "").lower()
        else:
            condition = str(condition).lower()
        
        if "new" in condition or condition_id in ["1000", "1500"]:
            return Condition.NEW
        elif "refurbished" in condition or "renewed" in condition or condition_id in ["2000", "2010", "2020", "2030"]:
            return Condition.REFURB
        elif condition_id in ["3000", "4000", "5000", "6000", "7000"]:
            return Condition.USED
        elif "used" in condition or "pre-owned" in condition:
            return Condition.USED
        
        return Condition.UNKNOWN
    
    def _parse_price(self, item: dict) -> tuple[float, float | None]:
        """Parse price and shipping from eBay item."""
        price_info = item.get("price", {})
        price = float(price_info.get("value", 0))
        
        shipping_options = item.get("shippingOptions", [])
        if shipping_options:
            shipping_cost_info = shipping_options[0].get("shippingCost", {})
            shipping = float(shipping_cost_info.get("value", 0))
        else:
            shipping = None
        
        return price, shipping
    
    def _parse_seller(self, item: dict) -> Seller:
        """Parse seller information."""
        seller_data = item.get("seller", {})
        
        feedback_percentage = seller_data.get("feedbackPercentage")
        rating = float(feedback_percentage) if feedback_percentage else None
        
        feedback_score = seller_data.get("feedbackScore")
        reviews = int(feedback_score) if feedback_score else None
        
        return Seller(
            name=seller_data.get("username"),
            rating=rating,
            reviews=reviews,
            is_official=seller_data.get("sellerAccountType") == "BUSINESS"
        )
    
    def _parse_shipping(self, item: dict) -> Shipping:
        """Parse shipping information."""
        shipping_options = item.get("shippingOptions", [])
        
        if not shipping_options:
            return Shipping()
        
        shipping_data = shipping_options[0]
        
        shipping_cost_info = shipping_data.get("shippingCost", {})
        cost = float(shipping_cost_info.get("value", 0)) if shipping_cost_info else None
        
        min_days = shipping_data.get("minEstimatedDeliveryDays")
        max_days = shipping_data.get("maxEstimatedDeliveryDays")
        eta = int((min_days + max_days) / 2) if min_days and max_days else min_days or max_days
        
        shipping_type = shipping_data.get("shippingServiceCode", "").lower()
        method = ShippingMethod.UNKNOWN
        if "expedited" in shipping_type or "express" in shipping_type:
            method = ShippingMethod.EXPEDITED
        elif "standard" in shipping_type or "economy" in shipping_type:
            method = ShippingMethod.STANDARD
        
        return Shipping(
            cost=cost,
            eta_days=int(eta) if eta else None,
            method=method
        )
    
    def _parse_returns(self, item: dict) -> Returns:
        """Parse return policy."""
        returns_data = item.get("returnTerms", {})
        
        if not returns_data:
            return Returns(unknown=True)
        
        accepted = returns_data.get("returnsAccepted", False)
        
        period = returns_data.get("returnPeriod", {})
        value = period.get("value")
        unit = period.get("unit", "").upper()
        
        window_days = None
        if value:
            if unit == "DAY":
                window_days = int(value)
            elif unit == "MONTH":
                window_days = int(value) * 30
        
        return Returns(
            available=accepted,
            window_days=window_days,
            unknown=False
        )
    
    def _extract_specs(self, item: dict) -> Specs:
        """Extract specs from item."""
        title = item.get("title", "")
        
        # Try to get first word as brand
        title_parts = title.split()
        brand = title_parts[0] if title_parts else None
        
        # Extract key terms
        key_terms = [
            word.lower() for word in title.replace("-", " ").split()
            if len(word) > 2
        ][:10]
        
        return Specs(
            brand=brand,
            model=None,  # Would need more parsing
            key_terms=key_terms
        )
    
    def _normalize_listing(self, item: dict) -> Listing:
        """Convert eBay item to normalized Listing."""
        price, shipping_cost = self._parse_price(item)
        
        return Listing(
            id=item.get("itemId", f"ebay-{hash(item.get('title', ''))}"),
            source=Source.EBAY,
            title=item.get("title", "Unknown Item"),
            url=item.get("itemWebUrl", ""),
            image_url=item.get("image", {}).get("imageUrl"),
            price=Price(value=price, currency="USD"),
            condition=self._parse_condition(item),
            shipping=self._parse_shipping(item),
            returns=self._parse_returns(item),
            seller=self._parse_seller(item),
            specs=self._extract_specs(item),
            signals=Signals(
                sponsored=item.get("adId") is not None,
                low_stock=item.get("quantityLimitPerBuyer") is not None
            ),
            raw=RawData(
                captured_at=datetime.now().isoformat(),
                notes=f"conditionId: {item.get('conditionId')}"
            )
        )
    
    async def search(self, query: str, max_results: int = 15) -> list[Listing]:
        """Search eBay Browse API."""
        token = await self._get_access_token()
        if not token:
            return []
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
        }
        
        params = {
            "q": query,
            "limit": min(max_results, 50),
            "filter": "buyingOptions:{FIXED_PRICE}",  # Exclude auctions
        }
        
        url = f"{self.BROWSE_API_URL}/item_summary/search"
        
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.get(url, headers=headers, params=params)
                response.raise_for_status()
                data = response.json()
            
            items = data.get("itemSummaries", [])
            listings = [
                self._normalize_listing(item) 
                for item in items[:max_results]
            ]
            
            print(f"[eBay] Found {len(listings)} listings for '{query}'")
            return listings
            
        except httpx.HTTPError as e:
            print(f"[eBay] API error: {e}")
            return []


# Singleton instance
ebay_connector = EbayConnector()
