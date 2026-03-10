export const clerkPublishableKey =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.CLERK_PUBLISHABLE_KEY || "";

export const clerkEnabled = Boolean(clerkPublishableKey);
