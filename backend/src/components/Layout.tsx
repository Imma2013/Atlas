const Layout = ({ children }: { children: React.ReactNode }) => {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,#e8eef7_0%,#f4f7fb_45%,#f8fafc_72%)] lg:pl-[17.5rem] dark:bg-[radial-gradient(circle_at_top_left,#0e1726_0%,#0a0f1a_45%,#070b14_72%)]">
      <div className="mx-3 max-w-screen-2xl lg:mx-auto">{children}</div>
    </main>
  );
};

export default Layout;
