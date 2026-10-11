export const clerkState = {
  userId: null as string | null,
  email: 'test@example.com',
  firstName: 'Test',
}

export const clerkModule = {
  auth: async () => ({ userId: clerkState.userId }),
  currentUser: async () =>
    clerkState.userId
      ? {
          id: clerkState.userId,
          firstName: clerkState.firstName,
          lastName: null,
          imageUrl: 'https://img.example.com/a.png',
          primaryEmailAddress: { emailAddress: clerkState.email },
          emailAddresses: [{ emailAddress: clerkState.email }],
        }
      : null,
}
