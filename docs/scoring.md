# Scoring Algorithm

Agentic Shopper uses a deterministic, interpretable scoring algorithm. Each listing is evaluated across 5 dimensions, then weighted to produce a final score.

## Component Scores

All component scores are normalized to [0, 1] range.

### 1. Price Score (Default Weight: 25%)

Compares listing price to user's budget.

| Condition | Score |
|-----------|-------|
| Price missing | 0.2 |
| Price > budget | 0.0 - 0.3 (scaled by overage) |
| Price ≤ budget | 0.5 - 1.0 (closer to $0 = higher) |

**Formula:**
```
if price > budget:
    score = max(0, 0.3 - overage_ratio * 0.3)
else:
    score = 1.0 - (price / budget) * 0.5
```

### 2. Delivery Score (Default Weight: 20%)

Based on estimated delivery time.

| ETA (days) | Base Score |
|------------|------------|
| Unknown | 0.3 |
| 1-2 | 1.0 |
| 3 | 0.85 |
| 4-5 | 0.7 |
| 6-7 | 0.5 |
| 8-10 | 0.35 |
| 11+ | 0.2 |

**Adjustments:**
- High delivery priority: extra penalty for slow (7+ days)
- Low delivery priority: minimum score 0.5
- Free shipping: +0.1 bonus

### 3. Reliability Score (Default Weight: 25%)

Combines seller rating with review count confidence.

**Base calculation:**
```
review_modifier = min(1.0, log10(reviews + 1) / 3)
score = rating * 0.7 + review_modifier * 0.3
```

**Adjustments:**
- Official store: +0.15 bonus
- Low risk tolerance + unknown seller: -30% penalty
- High risk tolerance: minimum score 0.5

### 4. Returns Score (Default Weight: 15%)

Based on return policy window.

| Window | Score |
|--------|-------|
| Unknown | 0.35 |
| No returns | 0.1 |
| 1-6 days | 0.3 |
| 7-13 days | 0.5 |
| 14-29 days | 0.7 |
| 30+ days | 1.0 |

### 5. Spec Match Score (Default Weight: 15%)

Keyword and brand matching.

| Condition | Effect |
|-----------|--------|
| Banned keyword found | 0.0 (disqualified) |
| Per required keyword matched | +0.2 |
| Brand in whitelist | +0.2 |
| Brand in blacklist | -0.3 |
| Query term match ratio | +0.3 × ratio |

## Total Score Calculation

```
total = Σ (weight[i] × component_score[i])
```

Weights are normalized to sum to 1.0 before calculation.

## Tuning Guidelines

| Preference | Adjust Weight |
|------------|---------------|
| Bargain hunting | Increase price weight |
| Need it fast | Increase delivery weight |
| Risk averse | Increase reliability weight |
| Buying for gift | Increase returns weight |
| Specific model | Increase spec_match weight |
