const SettingsPage = () => {
  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">
        Settings
      </h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Chat preferences and personalization.
      </p>

      <div className="mt-6 space-y-3">
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <p className="font-medium text-black dark:text-white">Preferences</p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            Theme, measurement units, and UI behavior.
          </p>
        </div>
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <p className="font-medium text-black dark:text-white">
            Personalization
          </p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            System instructions for your responses.
          </p>
        </div>
        <div className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary">
          <p className="font-medium text-black dark:text-white">
            Search Provider
          </p>
          <p className="mt-1 text-sm text-black/70 dark:text-white/70">
            SearchCans is active for web search.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
