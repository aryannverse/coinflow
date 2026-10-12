import { expect, it } from 'vitest'
import { reminderText, whatsappLink } from './reminder'

it('builds the polite nudge from spec §3.5', () => {
  expect(reminderText({ toName: 'Asha Rao', amountPaise: 120_000, groupName: 'Goa Trip', myUpiId: 'yash@okhdfc' }))
    .toBe('Hi Asha, a gentle nudge for ₹1,200 from Goa Trip. My UPI: yash@okhdfc')
  expect(reminderText({ toName: 'Asha', amountPaise: 120_050, groupName: 'Goa Trip', myUpiId: null }))
    .toBe('Hi Asha, a gentle nudge for ₹1,200.50 from Goa Trip.')
})

it('opens WhatsApp with the text and no recipient (Coinflow never sends)', () => {
  expect(whatsappLink('Hi & bye')).toBe('https://wa.me/?text=Hi%20%26%20bye')
})
