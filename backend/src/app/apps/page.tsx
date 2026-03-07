const apps = [
  { name: 'PowerPoint', description: 'Open generated deck outlines.' },
  { name: 'Word', description: 'Open summaries and drafts.' },
  { name: 'Excel', description: 'Open spreadsheet analyses.' },
  { name: 'Outlook', description: 'Review and send draft emails.' },
  { name: 'Teams', description: 'Review meeting transcript summaries.' },
];

const AppsPage = () => {
  return (
    <div className="pt-10 pb-20 px-2">
      <h1 className="text-3xl font-semibold text-black dark:text-white">Apps</h1>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Quick access to Microsoft 365 workflows.
      </p>
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
        {apps.map((app) => (
          <div
            key={app.name}
            className="rounded-xl border border-light-200 dark:border-dark-200 p-4 bg-light-primary dark:bg-dark-primary"
          >
            <p className="font-medium text-black dark:text-white">{app.name}</p>
            <p className="mt-1 text-sm text-black/70 dark:text-white/70">
              {app.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AppsPage;
