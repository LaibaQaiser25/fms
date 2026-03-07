import Sidebar from './Sidebar';

export default function Layout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="ml-56 flex-1 p-6 min-h-screen">
        {children}
      </main>
    </div>
  );
}