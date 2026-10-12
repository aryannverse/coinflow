import { test as setup } from '@playwright/test'
import { deleteUserByEmail, e2e2Email, e2eEmail, hasE2E2User, hasE2EUser, withSql } from './helpers'

setup.describe.configure({ mode: 'serial' })

// Deletes ONLY the E2E user's row (every child table cascades). The demo user is never touched.
setup('reset the e2e user', async () => {
  setup.skip(!hasE2EUser(), 'E2E_CLERK_USER_EMAIL is not set, so there is no signed-in user to reset')
  await deleteUserByEmail(e2eEmail())
})

setup('reset the second e2e user', async () => {
  setup.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  await deleteUserByEmail(e2e2Email())
})

setup('delete the friends fixture users', async () => {
  // seedFriends() (groups-a11y and capture specs) leaves these behind; they must not linger in the dev DB.
  await withSql((sql) => sql`delete from users where id like 'user_fixture_%'`)
})
