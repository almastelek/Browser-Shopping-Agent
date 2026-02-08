# Demo Walkthrough

Step-by-step demonstration of Agentic Shopper.

## Prerequisites

1. Server running on `http://localhost:8000`
2. Extension loaded in Chrome
3. (Optional) eBay API credentials configured

## Demo Steps

### 1. Start the Server

```bash
cd server
source venv/bin/activate
uvicorn app:app --reload --port 8000
```

Verify: Visit http://localhost:8000 - should see `"status": "running"`

### 2. Load the Extension

1. Go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `extension/` folder

### 3. Analyze a Product Page

1. Navigate to any eBay product page
2. Click the Agentic Shopper icon (🛒)
3. Click **"Analyze Page"**
4. See extracted: title, price, source

### 4. Find Best Deals

1. Enter query: `wireless noise-canceling headphones`
2. Set budget: `$200`
3. Check conditions: ✓ New, ✓ Refurbished
4. Set delivery priority: High
5. Click **"Find Best Deals"**

Expected result:
- Loading indicator while gathering candidates
- Top results displayed with:
  - Rank (#1, #2, #3)
  - Score (0-100)
  - Price
  - Score breakdown bars
  - Explanation bullets

### 5. Compare Top 3

1. After results appear, click **"Compare Top 3 in Browser"**
2. Three new tabs open
3. Tabs grouped as "Agentic Shopper" (purple)
4. Each tab shows:
  - Price highlighted in green
  - Shipping info highlighted in blue
  - Returns info highlighted in purple
  - Floating score overlay in top-right

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "No results found" | Check server is running, eBay credentials valid |
| Extension not loading | Check manifest.json syntax errors |
| Highlights not appearing | Refresh page after tabs open |
| Newegg scraping fails | eBay results still work (fallback) |

## Video Demo

To record a demo:
1. Use Chrome's built-in screen recording
2. Show: Extension popup → Search → Results → Compare tabs
3. Highlight the score explanations and visual overlays
