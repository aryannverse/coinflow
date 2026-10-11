import { clerkSetup } from '@clerk/testing/playwright'

/** Fetches the Clerk testing token once, in the main process, so every worker inherits CLERK_TESTING_TOKEN. */
export default async function globalSetup() {
  await clerkSetup()
}
