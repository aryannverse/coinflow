import { test as setup } from '@playwright/test'
import { e2eEmail, hasE2EUser, withSql } from './helpers'

setup.describe.configure({ mode: 'serial' })

// Deletes ONLY the E2E user's row (every child table cascades). The demo user is never touched.
setup('reset the e2e user', async () => {
  setup.skip(!hasE2EUser(), 'E2E_CLERK_USER_EMAIL is not set, so there is no signed-in user to reset')
  await withSql((sql) => sql`delete from users where email = ${e2eEmail()}`)
})
