import os
import json
import httpx
import logging
from typing import Optional, List, Dict, Any
from storage.models import DecisionSpec, Listing, Condition, Priority

logger = logging.getLogger(__name__)

class LLMManager:
    """
    Manages interactions with LLM for sophisticated shopping analysis.
    Supports OpenAI-compatible APIs and Ollama.
    """
    def __init__(self):
        self.api_key = os.getenv("LLM_API_KEY")
        self.base_url = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
        self.model = os.getenv("LLM_MODEL", "gpt-3.5-turbo")
        self.enabled = bool(self.api_key or "localhost" in self.base_url)

    async def analyze_product_context(self, context_text: str) -> Dict[str, Any]:
        """
        Uses LLM to extract product identity and search parameters from raw page text.
        Returns a simplified DecisionSpec-like dictionary.
        """
        if not self.enabled:
            return self._fallback_analysis(context_text)

        prompt = f"""
        You are an expert shopping researcher. Analyze the product context from a page and generate an intelligent, broad search strategy.
        
        IMPORTANT: Respect the Price Tier. 
        - If the 'Reference Price' is high (e.g. $400), don't suggest a 'budget' query like 'under $200'. 
        - Sugest queries for competitors in the SAME or HIGHER quality tier.
        - Suggest queries for newer versions or improved models of the current product.
        
        PAGE CONTEXT:
        {context_text[:2500]}
        
        Respond ONLY with a JSON object:
        {{
            "canonical_query": "A high-quality, broad query targeting similar tier (e.g. 'Sony WH-1000XM5 competitors' or 'Latest premium noise canceling headphones')",
            "product_name": "The specific product identified",
            "budget_estimated": 123.45, (This should be ~1.2x the Reference Price)
            "required_keywords": ["keyword1", "keyword2"],
            "brand": "BrandName",
            "is_high_quality_target": true/false
        }}
        """
        
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "response_format": { "type": "json_object" }
                    }
                )
                response.raise_for_status()
                data = response.json()
                return json.loads(data["choices"][0]["message"]["content"])
        except Exception as e:
            logger.error(f"LLM analysis failed: {e}")
            return self._fallback_analysis(context_text)

    async def rerank_results(self, query: str, candidates: List[Listing]) -> List[Dict[str, Any]]:
        """
        Uses LLM to do a final 'human-like' sanity check on the top 10 candidates.
        Provides qualitative reasoning.
        """
        if not self.enabled or not candidates:
            return []

        # We only rerank the subset to save tokens
        subset = candidates[:10]
        
        listings_brief = []
        for i, c in enumerate(subset):
            listings_brief.append({
                "index": i,
                "title": c.title,
                "price": c.price.value,
                "seller": c.seller.name,
                "rating": c.seller.rating
            })

        prompt = f"""
        You are a meticulous shopping assistant. Below is a list of results for '{query}'.
        Rank them based on overall quality and value. Prioritize official stores and highly-rated sellers.
        
        RESULTS:
        {json.dumps(listings_brief)}
        
        Respond with a JSON object containing an 'ordered_indices' list and a short 'reason' for the top choice.
        {{
            "ordered_indices": [2, 0, 1, ...],
            "top_reason": "..."
        }}
        """

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                headers = {"Authorization": f"Bearer {self.api_key}"} if self.api_key else {}
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers=headers,
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "response_format": { "type": "json_object" }
                    }
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"LLM reranking failed: {e}")
            return {}

    def _fallback_analysis(self, text: str) -> Dict[str, Any]:
        """Simple heuristic extraction if LLM is unavailable."""
        # Very crude fallback
        lines = text.split('\n')
        title = lines[0] if lines else "Product"
        return {
            "canonical_query": title[:60],
            "budget_estimated": 500.0,
            "required_keywords": [],
            "brand": None,
            "is_high_quality_target": False
        }

llm_manager = LLMManager()
