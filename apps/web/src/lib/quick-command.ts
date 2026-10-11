import { MAX_AMOUNT_PAISE, parseRupeesToPaise } from './money'

export type QuickCommand = { type: 'expense' | 'income'; amount: number; categoryId: string | null; note: string | null }
type Cat = { id: string; name: string; kind: 'expense' | 'income' }

const SYNONYMS: Record<string, string> = {
  uber: 'Transport', ola: 'Transport', cab: 'Transport', auto: 'Transport', metro: 'Transport', petrol: 'Transport', rapido: 'Transport',
  swiggy: 'Food & Dining', zomato: 'Food & Dining', lunch: 'Food & Dining', dinner: 'Food & Dining', chai: 'Food & Dining', coffee: 'Food & Dining',
  blinkit: 'Groceries', zepto: 'Groceries', bigbasket: 'Groceries', grocery: 'Groceries',
  netflix: 'Subscriptions', spotify: 'Subscriptions', prime: 'Subscriptions',
  recharge: 'Bills & Utilities', electricity: 'Bills & Utilities', wifi: 'Bills & Utilities',
  pvr: 'Entertainment', movie: 'Entertainment', medicine: 'Health', pharmacy: 'Health',
  amazon: 'Shopping', myntra: 'Shopping', flipkart: 'Shopping',
}

function parseAmount(token: string): number | null {
  const k = /^(.*?)k$/i.exec(token)
  const paise = parseRupeesToPaise(k ? k[1] : token)
  if (paise === null) return null
  const value = k ? paise * 1000 : paise
  return value > 0 && value <= MAX_AMOUNT_PAISE ? value : null
}

/** "250 food lunch" / "+50000 salary" / "1.2k uber" → a prefill for quick add, or null when there is no leading amount. */
export function parseQuickCommand(text: string, categories: Cat[]): QuickCommand | null {
  const trimmed = text.trim()
  const income = trimmed.startsWith('+')
  const [first, ...rest] = trimmed.replace(/^\+/, '').split(/\s+/).filter(Boolean)
  if (!first) return null
  const amount = parseAmount(first)
  if (amount === null) return null
  const type = income ? 'income' : 'expense'
  const pool = categories.filter((c) => c.kind === type)

  let categoryId: string | null = null
  const noteWords = [...rest]
  for (let i = 0; i < rest.length && !categoryId; i++) {
    const word = rest[i].toLowerCase()
    const direct = pool.find((c) => c.name.toLowerCase().split(/[\s&]+/).some((part) => part && part.startsWith(word) && word.length >= 3))
    if (direct) {
      categoryId = direct.id
      noteWords.splice(i, 1)
      break
    }
    const synonym = SYNONYMS[word]
    const viaSynonym = synonym ? pool.find((c) => c.name === synonym) : undefined
    if (viaSynonym) categoryId = viaSynonym.id
  }
  const note = noteWords.join(' ').trim()
  return { type, amount, categoryId, note: note || null }
}
