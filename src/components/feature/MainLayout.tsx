import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/feature/Sidebar';
import { useSidebar } from '@/contexts/SidebarContext';

export function MainLayout() {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-background-100">
      <Sidebar />
      <main className={`min-h-screen transition-all duration-300 ease-in-out ${collapsed ? 'md:ml-16' : 'md:ml-64'}`}>
        <div className="p-4 md:p-6 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}