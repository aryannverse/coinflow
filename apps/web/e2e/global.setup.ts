import { test as setup } from '@playwright/test'
import { e2e2Email, e2eEmail, hasE2E2User, hasE2EUser, withSql } from './helpers'

setup.describe.configure({ mode: 'serial' })

// Deletes ONLY the E2E user's row (every child table cascades). The demo user is never touched.
setup('reset the e2e user', async () => {
  setup.skip(!hasE2EUser(), 'E2E_CLERK_USER_EMAIL is not set, so there is no signed-in user to reset')
  await withSql(async (sql) => {
    // Their groups first, as the app's deleteUser does (one statement trips the group_members foreign key).
    await sql`delete from groups where created_by in (select id from users where email = ${e2eEmail()})`
    await sql`delete from users where email = ${e2eEmail()}`
  })
})

setup('reset the second e2e user', async () => {
  setup.skip(!hasE2E2User(), 'E2E2_CLERK_USER_EMAIL is not set')
  await withSql(async (sql) => {
    await sql`delete from groups where created_by in (select id from users where email = ${e2e2Email()})`
    await sql`delete from users where email = ${e2e2Email()}`
  })
})

setup('delete the friends fixture users', async () => {
  // seedFriends() (groups-a11y and capture specs) leaves these behind; they must not linger in the dev DB.
  await withSql((sql) => sql`delete from users where id like 'user_fixture_%'`)
})
