const modelModes = [
  {
    name: 'ATLAS JIT Router',
    model: 'Gemini Flash',
    details: 'Strict JSON classifier. Chooses required Microsoft servers only.',
  },
  {
    name: 'ATLAS Final',
    model: 'Sonnet 4.6',
    details: 'Primary execution model for summaries, drafting, and multi-step workflows.',
  },
  {
    name: 'ATLAS Final+',
    model: 'Opus 4.6',
    details: 'Heavy reasoning for deck generation and complex synthesis.',
  },
];

const BillingPage = () => {
  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">
        Models
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Stripe billing is disabled. Atlas now exposes model execution modes.
      </p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {modelModes.map((mode) => (
          <div
            key={mode.name}
            className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary"
          >
            <p className="font-medium text-black dark:text-white">{mode.name}</p>
            <p className="text-2xl mt-1 text-black dark:text-white">{mode.model}</p>
            <p className="mt-2 text-sm text-black/70 dark:text-white/70">
              {mode.details}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BillingPage;
