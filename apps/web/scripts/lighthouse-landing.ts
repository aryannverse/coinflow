/**
 * Lighthouse gate for the public landing page. Builds nothing: it needs a server that is already up
 * (`pnpm lh` starts `next start -p 3100` on the production build first, then runs this).
 *
 * Gate (DESKTOP preset): Performance >= 75 and Accessibility >= 95. The default MOBILE preset is measured and
 * printed too, but is informational only: under Clerk dev keys it carries a ~1.7 s handshake that production will not.
 * Both results, with the date, are written between the LANDING markers of docs/hci/evidence/lighthouse.md.
 *
 * Runs under plain `node` (native TypeScript stripping), NOT tsx: tsx's esbuild `keepNames` injects a `__name` helper into
 * Lighthouse's functions that get serialised into the page, which then crash there with "__name is not defined".
 * It needs no .env, so there is no `@next/env` here.
 *
 * Env: LH_URL (default http://localhost:3100/), CHROME_PATH (default Playwright's Chromium), LH_WRITE_EVIDENCE=1 to also write the evidence file (off by default).
 */
import { chromium } from '@playwright/test'
import { launch } from 'chrome-launcher'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import lighthouse from 'lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

const URL_ = process.env.LH_URL ?? 'http://localhost:3100/'
const EVIDENCE = resolve(process.cwd(), '../../docs/hci/evidence/lighthouse.md')
const MIN_PERF = 75
const MIN_A11Y = 95
const START = '<!-- LANDING:START -->'
const END = '<!-- LANDING:END -->'

type Scores = { performance: number; accessibility: number }

async function warm() {
  // First hits compile/cache on the server; measure the steady state.
  for (let i = 0; i < 2; i++) await fetch(URL_).then((r) => r.arrayBuffer())
}

async function measure(port: number, preset: 'desktop' | 'mobile'): Promise<Scores> {
  const result = await lighthouse(
    URL_,
    { port, onlyCategories: ['performance', 'accessibility'], logLevel: 'error' },
    preset === 'desktop' ? desktopConfig : undefined,
  )
  const cat = result?.lhr.categories
  return {
    performance: Math.round((cat?.performance?.score ?? 0) * 100),
    accessibility: Math.round((cat?.accessibility?.score ?? 0) * 100),
  }
}

function writeEvidence(desktop: Scores, mobile: Scores, pass: boolean) {
  if (process.env.LH_WRITE_EVIDENCE !== '1') return // opt-in, so `pnpm verify` never dirties the tree
  const date = new Date().toLocaleDateString('en-CA')
  const section = [
    START,
    `## Landing page (\`/\`, production build via \`next start\`)`,
    '',
    `Measured ${date} by \`pnpm lh\` (scripts/lighthouse-landing.ts). Server warmed with 2 requests first.`,
    '',
    '| Preset | Performance | Accessibility | Role |',
    '|---|---|---|---|',
    `| Desktop | ${desktop.performance} | ${desktop.accessibility} | Gate (Performance >= ${MIN_PERF}, Accessibility >= ${MIN_A11Y}): ${pass ? 'PASS' : 'FAIL'} |`,
    `| Mobile (Lighthouse default) | ${mobile.performance} | ${mobile.accessibility} | Informational, not gated |`,
    '',
    'Mobile is measured under Clerk development keys, which add a ~1.7 s handshake that a production instance will not have.',
    END,
  ].join('\n')
  const header = '# Lighthouse evidence\n\n'
  const placeholder = [
    '## App routes (signed in)',
    '',
    'Pending: `/home` Performance >= 85 and Accessibility >= 95 on every app route, measured while signed in',
    '(chrome-devtools MCP `lighthouse_audit` or the controller). Record date, route and scores here.',
    '',
  ].join('\n')
  let body: string
  if (existsSync(EVIDENCE)) {
    const current = readFileSync(EVIDENCE, 'utf8')
    body = current.includes(START) && current.includes(END)
      ? current.replace(new RegExp(`${START}[\\s\\S]*?${END}`), () => section)
      : `${current.trimEnd()}\n\n${section}\n`
  } else {
    body = `${header}${section}\n\n${placeholder}`
  }
  mkdirSync(dirname(EVIDENCE), { recursive: true })
  writeFileSync(EVIDENCE, body)
}

async function main() {
  await warm()
  const chrome = await launch({
    chromePath: process.env.CHROME_PATH ?? chromium.executablePath(),
    chromeFlags: ['--headless=new'],
  })
  let desktop: Scores
  let mobile: Scores
  try {
    desktop = await measure(chrome.port, 'desktop')
    mobile = await measure(chrome.port, 'mobile')
  } finally {
    chrome.kill()
  }
  const pass = desktop.performance >= MIN_PERF && desktop.accessibility >= MIN_A11Y
  console.log(`Landing desktop (gate)  - performance ${desktop.performance}, accessibility ${desktop.accessibility}`)
  console.log(`Landing mobile (info)   - performance ${mobile.performance}, accessibility ${mobile.accessibility}`)
  writeEvidence(desktop, mobile, pass)
  if (!pass) {
    console.error(`FAIL: desktop needs performance >= ${MIN_PERF} and accessibility >= ${MIN_A11Y}`)
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
