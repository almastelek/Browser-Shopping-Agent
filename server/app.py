"""
FastAPI application for Agentic Shopper server.
Provides ranking and search endpoints.
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from storage.models import (
    RankRequest, RankResponse, SearchRequest, SearchResponse, PageContext, DecisionSpec
)
from scoring.ranker import rank_candidates
from sources.ebay_api import ebay_connector
from brain.llm_manager import llm_manager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    print("[Server] Starting Agentic Shopper server...")
    print(f"[Server] eBay API configured: {ebay_connector.is_configured}")
    yield
    print("[Server] Shutting down...")


app = FastAPI(
    title="Agentic Shopper API",
    description="Local ranking server for browser-based shopping assistant",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for Chrome extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",
        "http://localhost:*",
        "http://127.0.0.1:*",
        "*"  # For development - restrict in production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {
        "service": "Agentic Shopper API",
        "status": "running",
        "version": "1.0.0"
    }


@app.get("/health")
async def health():
    """Detailed health check."""
    return {
        "status": "healthy",
        "ebay_configured": ebay_connector.is_configured
    }


@app.post("/rank", response_model=RankResponse)
async def rank(request: RankRequest):
    """
    Rank candidates based on decision spec.
    Optionally uses LLM for final re-ranking and reasoning.
    """
    try:
        ranked, filtered_count = rank_candidates(
            candidates=request.candidates,
            spec=request.decision_spec,
            context=request.context
        )
        
        llm_reason = None
        if request.use_llm_rerank and ranked:
            llm_data = await llm_manager.rerank_results(
                query=request.decision_spec.query,
                candidates=[r.listing for r in ranked]
            )
            if llm_data and "ordered_indices" in llm_data:
                # Reorder based on LLM preferences
                new_ordered = []
                for idx in llm_data["ordered_indices"]:
                    if idx < len(ranked):
                        new_ordered.append(ranked[idx])
                # Add any missing
                for r in ranked:
                    if r not in new_ordered:
                        new_ordered.append(r)
                ranked = new_ordered
                llm_reason = llm_data.get("top_reason")

        return RankResponse(
            ranked=ranked,
            total_candidates=len(request.candidates),
            filtered_count=filtered_count,
            llm_top_reason=llm_reason
        )
    
    except Exception as e:
        print(f"[Server] Ranking error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/analyze")
async def analyze(context: PageContext):
    """
    Perform LLM-powered analysis of the captured page context.
    Returns a 'Smart Profile' for the product.
    """
    try:
        # Use title, keywords, and PRICE as context
        text_to_analyze = f"Title: {context.title}\nKeywords: {context.keywords}\nReference Price: ${context.price if context.price else 'Unknown'}"
        if context.url:
            text_to_analyze += f"\nURL: {context.url}"
            
        smart_data = await llm_manager.analyze_product_context(text_to_analyze)
        
        return {
            "status": "success",
            "smart_data": smart_data
        }
    except Exception as e:
        print(f"[Server] Analysis error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/search/ebay", response_model=SearchResponse)
async def search_ebay(request: SearchRequest):
    """
    Search eBay for listings.
    
    Called by the extension to gather candidates from eBay.
    Returns normalized listings ready for ranking.
    """
    if not ebay_connector.is_configured:
        raise HTTPException(
            status_code=503,
            detail="eBay API not configured. Set EBAY_CLIENT_ID and EBAY_CLIENT_SECRET."
        )
    
    try:
        listings = await ebay_connector.search(
            query=request.query,
            max_results=request.max_results
        )
        
        return SearchResponse(
            listings=listings,
            source="ebay",
            query=request.query
        )
    
    except Exception as e:
        print(f"[Server] eBay search error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=True)
