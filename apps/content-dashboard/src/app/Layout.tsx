import { NavLink, Outlet } from 'react-router-dom';
import { Film, GitBranch, Upload, Tv2, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/series', icon: Film, label: 'Series' },
  { to: '/uploads', icon: Upload, label: 'Uploads' },
];

export function Layout() {
  const [dark, setDark] = useState(
    () => (typeof localStorage !== 'undefined' ? localStorage.getItem('theme') !== 'light' : true),
  );

  // Apply the theme class + persist it whenever it changes.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  function toggleTheme() {
    setDark((d) => !d);
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 border-r flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b">
          <Tv2 className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm tracking-tight">Firexp</span>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground ml-1">CMS</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/20 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}

          {/* Flow editor is accessed per-episode, not a top-level nav */}
          <div className="flex items-center gap-2.5 px-3 py-2 text-xs text-muted-foreground/60 mt-4">
            <GitBranch className="h-3.5 w-3.5" />
            Flow Editor (via episode)
          </div>
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t">
          <Button size="sm" variant="ghost" onClick={toggleTheme} className="w-full justify-start gap-2">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {dark ? 'Light mode' : 'Dark mode'}
          </Button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Topbar */}
        <header className="border-b px-6 py-3 flex items-center justify-between shrink-0">
          <h1 className="font-semibold text-sm text-muted-foreground">
            Firexp · Interactive Narrative CMS
          </h1>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
