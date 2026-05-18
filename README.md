# 📈 Intraday Stock Tracker India

A simple, mobile-friendly web app to track **Indian equity stocks** for intraday trading. Built with Next.js 14, Tailwind CSS, and designed for risk management and learning.

**⚠️ IMPORTANT DISCLAIMER**  
This is **NOT financial advice**. Trading involves substantial risk of loss. This app is for **tracking, journaling, education, and risk management only**. Past performance does not guarantee future results. Always trade responsibly.

---

## ✨ Features

- **Dashboard**: Live watchlist preview, daily P/L tracker with progress bar, target (+₹500) & loss limit (-₹500) warnings
- **Watchlist**: Add/remove NSE/BSE equity symbols with simulated live prices & % changes
- **Trade Journal**: Easy trade entry (Buy/Sell, Entry, Exit, Qty, Brokerage) with auto P/L calculation
- **Risk Alerts**: Automatic banners when daily target or loss limit is reached
- **AI Trading Coach**: Powered by OpenAI — summarizes your day, highlights lessons, gives discipline tips (no buy/sell calls)
- **Mobile-First Design**: Bottom navigation, clean cards, dark trading theme

---

## 🛠 Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Lucide Icons**
- **OpenAI API** (server-side only)
- **LocalStorage** for persistence (no backend needed)

---

## 🚀 Quick Start (Local Development)

1. **Clone the repo**
   ```bash
   git clone https://github.com/yourusername/intraday-stock-tracker-india.git
   cd intraday-stock-tracker-india
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Setup environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Add your **OpenAI API key** in `.env.local`:
   ```
   OPENAI_API_KEY=sk-...
   ```

4. **Run the development server**
   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
intraday-stock-tracker-india/
├── app/
│   ├── layout.tsx              # Root layout + providers
│   ├── page.tsx                # Redirects to /dashboard
│   ├── dashboard/
│   │   └── page.tsx
│   ├── watchlist/
│   │   └── page.tsx
│   ├── trades/
│   │   └── page.tsx
│   ├── ai-summary/
│   │   └── page.tsx
│   ├── settings/
│   │   └── page.tsx
│   └── api/
│       └── ai/
│           └── route.ts        # OpenAI server action
├── components/
│   ├── BottomNav.tsx
│   ├── StockCard.tsx
│   ├── TradeFormModal.tsx
│   ├── PLProgress.tsx
│   └── Disclaimer.tsx
├── contexts/
│   └── AppContext.tsx          # Stocks + Trades state
├── lib/
│   ├── marketData.ts           # Mock price service (replaceable)
│   └── utils.ts
├── .env.example
├── README.md
└── package.json
```

---

## 🔑 Environment Variables

| Variable           | Description                        | Required |
|--------------------|------------------------------------|----------|
| `OPENAI_API_KEY`   | Your OpenAI secret key             | Yes (for AI) |
| `MARKET_DATA_API_KEY` | Placeholder for future broker API | No       |

---

## 📊 How to Use

1. **Add stocks** to Watchlist (e.g. RELIANCE, TCS, HDFCBANK)
2. **Enter trades** from Dashboard or Trades page
3. Watch **real-time simulated prices** update every 3 seconds
4. Monitor **Daily P/L** — green progress = profit, red = loss
5. Hit **₹500 profit** → Target banner appears
6. Hit **-₹500 loss** → Loss limit warning
7. Use **AI Summary** at end of day for insights

---

## 🔄 Replacing Mock Market Data

Currently uses simulated prices. To connect real data later:

- **Zerodha Kite Connect**
- **Upstox API**
- **Angel One SmartAPI**
- **Dhan API**
- **Fyers API**

Just replace `lib/marketData.ts` with real API calls (keep server-side for security).

---

## 🚀 Deploy to Vercel (Recommended)

1. Push to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/intraday-stock-tracker-india.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo

3. Add Environment Variables in Vercel Dashboard:
   - `OPENAI_API_KEY`

4. Deploy! Your app will be live at `https://your-project.vercel.app`

---

## 🛡️ Security Notes

- All API calls (OpenAI) happen **server-side** via `/api/ai`
- No API keys exposed in browser
- Basic input validation on forms
- All data stored locally in browser

---

## 📝 Future Improvements (Ideas)

- Real broker integration (Kite, Upstox)
- Historical trade analytics & charts
- Multiple day history
- Push notifications for targets
- Export trades as CSV/PDF
- Voice notes for trade journaling

---

**Built with ❤️ for Indian retail traders who want to trade smarter, not harder.**

*Remember: The best traders are disciplined ones. This app helps you become one.*