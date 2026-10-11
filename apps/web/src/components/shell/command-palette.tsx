'use client'
import { Moon, Plus, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useCategories } from '@/hooks/queries'
import { formatINR } from '@/lib/money'
import { parseQuickCommand } from '@/lib/quick-command'
import { NAV_ITEMS } from './nav-items'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState('')
  const router = useRouter()
  const quick = useQuickAdd()
  const { setTheme, resolvedTheme } = useTheme()
  const { data: categories = [] } = useCategories()
  const parsed = parseQuickCommand(text, categories)
  const cat = categories.find((c) => c.id === parsed?.categoryId)

  const handleOpenChange = (o: boolean) => {
    if (!o) setText('') // closing by Esc or backdrop starts the next open fresh, too
    onOpenChange(o)
  }
  const run = (fn: () => void) => {
    handleOpenChange(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Ask Coinflow" description="Add an expense, jump to a page, or search">
      <CommandInput placeholder="“250 food lunch”, “+5000 salary”, or search…" value={text} onValueChange={setText} />
      <CommandList>
        <CommandEmpty>Try starting with an amount, like “120 chai”.</CommandEmpty>
        {parsed && (
          <CommandGroup heading="Quick add">
            <CommandItem value={`add ${text}`} onSelect={() => run(() => quick.open(parsed))} className="min-h-12">
              <Plus className="text-primary" aria-hidden />
              {parsed.type === 'income' ? 'Add income' : 'Add expense'} {formatINR(parsed.amount)}
              {cat ? ` · ${cat.emoji} ${cat.name}` : ''}
              {parsed.note ? ` · “${parsed.note}”` : ''}
            </CommandItem>
          </CommandGroup>
        )}
        {text.trim() && !parsed && (
          <CommandGroup heading="Search">
            <CommandItem value={`search ${text}`} onSelect={() => run(() => router.push(`/activity?q=${encodeURIComponent(text.trim())}`))} className="min-h-12">
              <Search aria-hidden /> Search activity for “{text.trim()}”
            </CommandItem>
          </CommandGroup>
        )}
        <CommandGroup heading="Go to">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
            <CommandItem key={href} value={`go ${label}`} onSelect={() => run(() => router.push(href))} className="min-h-12">
              <Icon aria-hidden /> {label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem value="toggle theme" onSelect={() => run(() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark'))} className="min-h-12">
            <Moon aria-hidden /> Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
