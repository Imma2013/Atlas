const plans = [
  { name: 'Free', price: '$0', actions: '50 actions', opus: 'No Opus' },
  {
    name: 'Starter',
    price: '$19/mo',
    actions: '300 actions',
    opus: 'No Opus',
  },
  {
    name: 'Pro',
    price: '$49/mo',
    actions: '1,000 actions',
    opus: 'Opus enabled',
  },
  {
    name: 'Business',
    price: '$129/user/mo',
    actions: 'Unlimited',
    opus: 'Opus enabled',
  },
];

const BillingPage = () => {
  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">
        Billing
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Plan limits and Stripe-powered billing.
      </p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary"
          >
            <p className="font-medium text-black dark:text-white">{plan.name}</p>
            <p className="text-2xl mt-1 text-black dark:text-white">{plan.price}</p>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {plan.actions}
            </p>
            <p className="text-sm text-black/70 dark:text-white/70">
              {plan.opus}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BillingPage;
