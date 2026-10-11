import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <SignIn />
    </main>
  )
}
