// Alias table: a cleaned merchant string containing `pattern` (as whole words) maps to a display name and category.
// Longer patterns win, so "AMAZON PRIME" is matched before "AMAZON".

export interface MerchantAlias {
  pattern: string;
  name: string;
  category: string;
}

export const MERCHANT_ALIASES: MerchantAlias[] = [
  // subscriptions
  { pattern: 'NETFLIX', name: 'Netflix', category: 'subscriptions' },
  { pattern: 'SPOTIFY', name: 'Spotify', category: 'subscriptions' },
  { pattern: 'AMAZON PRIME', name: 'Amazon Prime', category: 'subscriptions' },
  { pattern: 'PRIME VIDEO', name: 'Amazon Prime', category: 'subscriptions' },
  { pattern: 'HULU', name: 'Hulu', category: 'subscriptions' },
  { pattern: 'DISNEY PLUS', name: 'Disney+', category: 'subscriptions' },
  { pattern: 'DISNEYPLUS', name: 'Disney+', category: 'subscriptions' },
  { pattern: 'YOUTUBE PREMIUM', name: 'YouTube Premium', category: 'subscriptions' },
  { pattern: 'APPLE COM BILL', name: 'Apple Services', category: 'subscriptions' },
  { pattern: 'ICLOUD', name: 'iCloud', category: 'subscriptions' },
  { pattern: 'ADOBE', name: 'Adobe', category: 'subscriptions' },
  { pattern: 'DROPBOX', name: 'Dropbox', category: 'subscriptions' },
  { pattern: 'FIGMA', name: 'Figma', category: 'subscriptions' },
  // shopping
  { pattern: 'AMAZON', name: 'Amazon', category: 'shopping' },
  { pattern: 'AMZN', name: 'Amazon', category: 'shopping' },
  { pattern: 'APPLE STORE', name: 'Apple Store', category: 'shopping' },
  { pattern: 'TARGET', name: 'Target', category: 'shopping' },
  { pattern: 'WALMART', name: 'Walmart', category: 'shopping' },
  { pattern: 'IKEA', name: 'IKEA', category: 'shopping' },
  // groceries
  { pattern: 'TRADER JOES', name: "Trader Joe's", category: 'groceries' },
  { pattern: 'WHOLEFDS', name: 'Whole Foods', category: 'groceries' },
  { pattern: 'WHOLE FOODS', name: 'Whole Foods', category: 'groceries' },
  { pattern: 'SAFEWAY', name: 'Safeway', category: 'groceries' },
  { pattern: 'KROGER', name: 'Kroger', category: 'groceries' },
  { pattern: 'COSTCO', name: 'Costco', category: 'groceries' },
  // dining
  { pattern: 'BLUE BOTTLE', name: 'Blue Bottle Coffee', category: 'dining' },
  { pattern: 'STARBUCKS', name: 'Starbucks', category: 'dining' },
  { pattern: 'DOORDASH', name: 'DoorDash', category: 'dining' },
  { pattern: 'UBER EATS', name: 'Uber Eats', category: 'dining' },
  { pattern: 'CHIPOTLE', name: 'Chipotle', category: 'dining' },
  { pattern: 'CHEESECAKE FACTORY', name: 'Cheesecake Factory', category: 'dining' },
  // transport
  { pattern: 'UBER', name: 'Uber', category: 'transport' },
  { pattern: 'LYFT', name: 'Lyft', category: 'transport' },
  { pattern: 'SHELL', name: 'Shell', category: 'transport' },
  { pattern: 'CHEVRON', name: 'Chevron', category: 'transport' },
  // health & fitness
  { pattern: 'CITYGYM', name: 'CityGym', category: 'health & fitness' },
  { pattern: 'CVS', name: 'CVS Pharmacy', category: 'health & fitness' },
  { pattern: 'WALGREENS', name: 'Walgreens', category: 'health & fitness' },
  // bills
  { pattern: 'GREENVIEW PROPERTY', name: 'Greenview Property Mgmt', category: 'housing' },
  { pattern: 'VERIZON', name: 'Verizon', category: 'phone & internet' },
  { pattern: 'COMCAST', name: 'Comcast', category: 'phone & internet' },
  { pattern: 'CITY WATER', name: 'City Water', category: 'utilities' },
  { pattern: 'AUTOFIN', name: 'AutoFin Loan', category: 'loan' },
  { pattern: 'HOMESHIELD', name: 'HomeShield', category: 'insurance' },
  // income
  { pattern: 'ACME DESIGN', name: 'Acme Design Co', category: 'income' },
  { pattern: 'INTEREST', name: 'Interest', category: 'income' },
  // money movement
  { pattern: 'VENMO', name: 'Venmo', category: 'other' },
  { pattern: 'ATM', name: 'ATM Withdrawal', category: 'other' },
  { pattern: 'TRANSFER TO SAV', name: 'Transfer to savings', category: 'transfer' },
  { pattern: 'TRANSFER FROM CHK', name: 'Transfer from bank account', category: 'transfer' },
  { pattern: 'REWARDS CARD', name: 'Credit card bill payment', category: 'card payment' },
  { pattern: 'PAYMENT THANK YOU', name: 'Card bill payment received', category: 'card payment' },
];
