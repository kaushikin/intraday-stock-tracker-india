"""
Fix: tradeability gate using inflated risk basis + fabricated fallback sentiment.

Run this from the repo root (same folder as package.json):
    python3 patch_tradeability_and_sentiment_fix.py

Then:
    npm run build
    git add app/signals/page.tsx
    git commit -m "Fix tradeability gate using inflated risk basis + stop fabricating fallback sentiment"
    git push
    git status
"""

from pathlib import Path

path = Path("app/signals/page.tsx")
text = path.read_text()

replacements = [
    # 1. Add isFallback flag to the sentiment type so the UI can distinguish
    #    real Hugging Face analysis from a "could not reach it" placeholder.
    (
        """type AISentiment = {
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  signalScore: number;
};""",
        """type AISentiment = {
  label: 'positive' | 'negative' | 'neutral';
  confidence: number;
  signalScore: number;
  isFallback?: boolean;
};""",
    ),
    # 2. Remove GATE_QUALIFICATION_MAX_RISK entirely. It made the TRADABLE
    #    badge and "N signals TRADABLE" summary evaluate a hypothetical
    #    Rs.1200-risk position while real trades are sized at Rs.500 (fixed
    #    Rs.50 charges get diluted at the bigger size, inflating Net R:R and
    #    Quality vs what you actually trade). This let WEAK/sub-threshold
    #    setups render as TRADABLE.
    (
        """const DEFAULT_ESTIMATED_CHARGES = 50;

// Larger notional risk basis used ONLY to qualify tradeability (dilutes the
// fixed charge drag so Net R:R reflects the setup, not a \u20b9500 sizing
// artifact). This is never shown as a quantity or used for real sizing.
const GATE_QUALIFICATION_MAX_RISK = 1200;""",
        """const DEFAULT_ESTIMATED_CHARGES = 50;""",
    ),
    # 3. Fallback sentiment must NOT fabricate a positive/negative reading by
    #    echoing the technical signal direction. That previously rendered as
    #    fake independent news corroboration and could mask genuinely
    #    bearish headlines when the Hugging Face call failed.
    (
        """function getFallbackSentiment(signal: TradeSignal): AISentiment {
  if (signal.side === 'BUY') {
    return {
      label: 'positive',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  if (signal.side === 'SELL') {
    return {
      label: 'negative',
      confidence: 70,
      signalScore: signal.strength === 'STRONG' ? 78 : 65,
    };
  }

  return {
    label: 'neutral',
    confidence: 60,
    signalScore: 45,
  };
}""",
        """function getFallbackSentiment(signal: TradeSignal): AISentiment {
  // Hugging Face sentiment could not be reached or parsed. Do NOT fabricate
  // a positive/negative reading by echoing the technical signal direction --
  // that previously rendered as fake independent news corroboration and
  // could mask genuinely bearish headlines. Report neutral + isFallback so
  // the UI can flag this as "AI unavailable" instead of a real analysis.
  return {
    label: 'neutral',
    confidence: 0,
    signalScore: calculateSignalScore(signal, 'neutral', 0),
    isFallback: true,
  };
}""",
    ),
    # 4. SentimentBox: render a distinct "AI unavailable" state for fallback
    #    data instead of styling it identically to a genuine analysis.
    (
        """  if (!sentiment) {
    return null;
  }

  const isPositive = sentiment.label === 'positive';""",
        """  if (!sentiment) {
    return null;
  }

  if (sentiment.isFallback) {
    return (
      <div className="mt-4 rounded-2xl border border-slate-500/30 bg-slate-500/10 p-4">
        <div className="flex items-center gap-2 text-slate-400">
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-semibold">
            AI analysis unavailable \u2014 showing technicals only
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Hugging Face sentiment could not be reached for this signal. Rely on
          the news headlines below and price-action reasons directly.
        </p>
      </div>
    );
  }

  const isPositive = sentiment.label === 'positive';""",
    ),
    # 5. PositionSizingBox: evaluate tradeability on the SAME real sizing
    #    (`sizing`, Rs.500 risk) already shown to the user above, instead of
    #    recomputing at GATE_QUALIFICATION_MAX_RISK.
    (
        """        {(() => {
          const gateSizing = calculatePositionSizing({
            side: signal.side,
            entry: signal.entry,
            stopLoss: signal.stopLoss,
            target: signal.target1,
            maxRiskAmount: GATE_QUALIFICATION_MAX_RISK,
            estimatedCharges: DEFAULT_ESTIMATED_CHARGES,
          });

          const gate = evaluateTradeability({
            quality: gateSizing.quality,
            strength: signal.strength,
            netRiskReward: gateSizing.netRiskReward,
          });""",
        """        {(() => {
          // Gate must evaluate the SAME real-money sizing shown to the user
          // above (DEFAULT_MAX_RISK_PER_TRADE), not a hypothetical larger
          // position. Using a bigger risk budget dilutes the fixed
          // estimatedCharges and makes net R:R look better than it really
          // is at real trade size, which was letting WEAK-quality, sub
          // threshold setups render as TRADABLE. See bug report 2026-07-07.
          const gate = evaluateTradeability({
            quality: sizing.quality,
            strength: signal.strength,
            netRiskReward: sizing.netRiskReward,
          });""",
    ),
    # 6. Top-of-page "No Trade Day" / tradable-count summary -- same fix,
    #    evaluate at real DEFAULT_MAX_RISK_PER_TRADE sizing.
    (
        """    const evaluated = activeSignals.map((signal) => {
      const gateSizing = calculatePositionSizing({
        side: signal.side as 'BUY' | 'SELL',
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        target: signal.target1,
        maxRiskAmount: GATE_QUALIFICATION_MAX_RISK,
        estimatedCharges: DEFAULT_ESTIMATED_CHARGES,
      });

      return evaluateTradeability({
        quality: gateSizing.quality,
        strength: signal.strength,
        netRiskReward: gateSizing.netRiskReward,
      });
    });""",
        """    const evaluated = activeSignals.map((signal) => {
      // Same fix as PositionSizingBox: evaluate tradeability at real
      // DEFAULT_MAX_RISK_PER_TRADE sizing, not GATE_QUALIFICATION_MAX_RISK.
      const realSizing = calculatePositionSizing({
        side: signal.side as 'BUY' | 'SELL',
        entry: signal.entry,
        stopLoss: signal.stopLoss,
        target: signal.target1,
        maxRiskAmount: DEFAULT_MAX_RISK_PER_TRADE,
        estimatedCharges: DEFAULT_ESTIMATED_CHARGES,
      });

      return evaluateTradeability({
        quality: realSizing.quality,
        strength: signal.strength,
        netRiskReward: realSizing.netRiskReward,
      });
    });""",
    ),
]

ok = True
for i, (old, new) in enumerate(replacements, 1):
    count = text.count(old)
    if count == 1:
        text = text.replace(old, new)
        print(f"[OK] Replacement {i} applied (1 match).")
    elif count == 0:
        print(f"[FAIL] Replacement {i}: no match found. Skipping this one, file otherwise unaffected by it.")
        ok = False
    else:
        print(f"[FAIL] Replacement {i}: {count} matches found (expected 1, ambiguous). Skipping this one.")
        ok = False

path.write_text(text)
print("\nFile written. Review with: git diff app/signals/page.tsx")
if not ok:
    print("WARNING: one or more replacements failed -- check messages above before committing.")
