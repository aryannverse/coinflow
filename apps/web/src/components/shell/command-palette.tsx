'use client'
import { Moon, Plus, Search, Sparkles, UserPlus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useState } from 'react'
import { useAgent } from '@/components/agent/agent-provider'
import { useQuickAdd } from '@/components/quick-add/quick-add-provider'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { useCategories, useUpdateMe } from '@/hooks/queries'
import { formatINR } from '@/lib/money'
import { paletteFilter } from '@/lib/palette-filter'
import { parseQuickCommand } from '@/lib/quick-command'
import { NAV_ITEMS } from './nav-items'

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [text, setText] = useState('')
  const router = useRouter()
  const quick = useQuickAdd()
  const agent = useAgent()
  const online = agent.health?.online === true // spec §4.7: the palette's "Ask Coinflow…" row exists only while the assistant can answer
  const { setTheme, resolvedTheme } = useTheme()
  const updateMe = useUpdateMe()
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
    <CommandDialog open={open} onOpenChange={handleOpenChange} title="Quick commands" description="Add an expense, jump to a page, or search">
      <Command filter={paletteFilter}>
      <CommandInput placeholder="“250 food lunch”, “+5000 salary”, or search…" value={text} onValueChange={setText} />
      <CommandList>
        <CommandEmpty>Try starting with an amount, like “120 chai”.</CommandEmpty>
        {online && (
          <CommandGroup heading="Ask">
            <CommandItem value={`ask ${text.trim()}`} onSelect={() => run(() => agent.open(text.trim() || undefined))} className="min-h-12">
              <Sparkles className="text-primary" aria-hidden />
              {text.trim() ? `Ask Coinflow: “${text.trim()}”` : 'Ask Coinflow…'}
            </CommandItem>
          </CommandGroup>
        )}
        {parsed && (
          <CommandGroup heading="Quick add">
            <CommandItem value={`add ${text.trim()}`} onSelect={() => run(() => quick.open(parsed))} className="min-h-12">
              <Plus className="text-primary" aria-hidden />
              {parsed.type === 'income' ? 'Add income' : 'Add expense'} {formatINR(parsed.amount)}
              {cat ? ` · ${cat.emoji} ${cat.name}` : ''}
              {parsed.note ? ` · “${parsed.note}”` : ''}
            </CommandItem>
          </CommandGroup>
        )}
        {text.trim() && !parsed && (
          <CommandGroup heading="Search">
            <CommandItem value={`search ${text.trim()}`} onSelect={() => run(() => router.push(`/activity?q=${encodeURIComponent(text.trim())}`))} className="min-h-12">
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
          <CommandItem value="go Friends" onSelect={() => run(() => router.push('/friends'))} className="min-h-12">
            <UserPlus aria-hidden /> Friends
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Preferences">
          <CommandItem value="toggle theme" onSelect={() => run(() => {
            const next = resolvedTheme === 'dark' ? 'light' : 'dark'
            setTheme(next)
            updateMe.mutate({ theme: next })
          })} className="min-h-12">
            <Moon aria-hidden /> Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} theme
          </CommandItem>
        </CommandGroup>
      </CommandList>
      </Command>
    </CommandDialog>
  )
}
