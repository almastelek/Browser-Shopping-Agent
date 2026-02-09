# Agentic Shopper

**Browser-based autonomous shopping assistant that plans source queries, gathers candidates, normalizes listings, ranks with interpretable scoring, and assists decision-making in-browser.**

## Features

- 🔍 **Page Analysis**: Extract product info from any e-commerce page
- 🛒 **Multi-Source Search**: eBay API + Newegg scraping
- 📊 **Explainable Ranking**: Transparent scoring with breakdown by component
- 🏷️ **Smart Highlights**: Visual overlays on product pages
- 📑 **Tab Grouping**: Compare top 3 picks side-by-side

## Quick Start

### 1. Server Setup

```bash
cd server

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure eBay API (optional)
cp .env.example .env
# Edit .env with your eBay credentials

# Start server
uvicorn app:app --reload --port 8000
```

### 2. Extension Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked"
4. Select the `extension/` folder

### 3. Usage

1. Navigate to any product or search page
2. Click the Agentic Shopper icon
3. Enter your search query and preferences
4. Click "Find Best Deals"
5. Click "Compare Top 3" to open results in grouped tabs

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Chrome Extension                          │
│  ┌──────────┐   ┌─────────────────┐   ┌──────────────────┐ │
│  │  Popup   │◄──│ Service Worker  │──►│ Content Scripts  │ │
│  │   UI     │   │  (Agent Loop)   │   │ (Page Parsing)   │ │
│  └──────────┘   └────────┬────────┘   └──────────────────┘ │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Local Python Server                         │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │  /rank API   │  │  Scoring    │  │  eBay Connector    │ │
│  │  endpoint    │◄─│  Engine     │  │  (Browse API)      │ │
│  └──────────────┘  └─────────────┘  └────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Scoring Breakdown

| Component | Weight | Description |
|-----------|--------|-------------|
| Price | 25% | How close to budget (lower = better) |
| Delivery | 20% | Shipping speed and cost |
| Reliability | 25% | Seller rating + review count |
| Returns | 15% | Return window availability |
| Spec Match | 15% | Keyword and brand matching |

## Privacy

- Runs entirely locally
- No data sent to external servers (except eBay API)
- No purchase automation
- No account required

## Project Structure

```
Browser-Shopping-Agent/
├── extension/           # Chrome extension
│   ├── manifest.json
│   ├── popup/          # Extension UI
│   ├── background/     # Service worker
│   ├── content/        # Page parsers & highlighter
│   └── shared/         # Shared schema & messaging
├── server/             # Python backend
│   ├── app.py          # FastAPI application
│   ├── scoring/        # Ranking algorithm
│   ├── sources/        # eBay API connector
│   └── storage/        # Models & database
└── docs/               # Documentation
```

## Requirements

- Python 3.11+
- Chrome browser
- eBay Developer Account (for API access)

## License

MIT
