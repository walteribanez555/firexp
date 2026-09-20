import { Outlet } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Sidebar } from './Sidebar';

export function Layout() {
  const [dark, setDark] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') !== 'light' : true),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar dark={dark} onToggleTheme={() => setDark((d) => !d)} />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
