import { format } from 'date-fns';

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function formatPrice(price: number): string {
  return price.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function getCurrentDate(): string {
  return format(new Date(), 'dd MMM yyyy');
}

export function getCurrentTime(): string {
  return format(new Date(), 'hh:mm a');
}

export function calculateTradePL(trade: {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  brokerage: number;
}): number {
  if (trade.side === 'BUY') {
    return (trade.exitPrice - trade.entryPrice) * trade.quantity - trade.brokerage;
  } else {
    return (trade.entryPrice - trade.exitPrice) * trade.quantity - trade.brokerage;
  }
}