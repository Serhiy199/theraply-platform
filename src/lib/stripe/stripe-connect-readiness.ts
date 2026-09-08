export function isStripeConnectReady(input: {
  stripeAccountId?: string | null;
  stripePayoutsEnabled?: boolean | null;
  stripeDetailsSubmitted?: boolean | null;
}) {
  return Boolean(
    input.stripeAccountId &&
      input.stripePayoutsEnabled &&
      input.stripeDetailsSubmitted,
  );
}
