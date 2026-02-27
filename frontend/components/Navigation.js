'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../lib/AuthContext';
import { api } from '../lib/api';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, currentSeason, currentGameweek } = useAuth();
  const [adminMenuOpen, setAdminMenuOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  async function handleLogout() {
    try {
      await logout();
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  }

  async function handleGameweekChange(newGw) {
    setIsUpdating(true);
    try {
      await api.updateSetting('current_gameweek', newGw);
      window.location.reload();
    } catch (error) {
      console.error('Error updating gameweek:', error);
    } finally {
      setIsUpdating(false);
    }
  }

  const navItems = [
    { href: '/', label: 'Home' },
    { href: '/games', label: 'My Games' },
  ];

  const adminItems = [
    { href: '/admin/settings', label: 'Settings' },
  ];

  return (
    <nav className="shadow-lg border-b border-gray-200">
      {/* Top bar */}
      <div className="bg-primary-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-end h-8 items-center">
            {user ? (
              <div className="flex items-center gap-4">
                <span className="text-sm text-gray-300">
                  Welcome, <span className="font-semibold text-white">{user.username}</span>
                </span>
                <button onClick={handleLogout} className="text-sm text-gray-300 hover:text-white cursor-pointer">
                  Logout
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login" className="text-sm text-gray-300 hover:text-white">Login</Link>
                <span className="text-gray-500">|</span>
                <Link href="/register" className="text-sm text-gray-300 hover:text-white">Register</Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main nav */}
      <div className="bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-14 justify-between">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <Link href="/" className="text-xl font-bold text-primary-600">
                  PL Picker
                </Link>
              </div>
              <div className="hidden sm:ml-8 sm:flex sm:space-x-8 items-center">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors h-full
                      ${pathname === item.href
                        ? 'border-primary-500 text-gray-900'
                        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                      }
                    `}
                  >
                    {item.label}
                  </Link>
                ))}

                {user?.role === 'admin' && (
                  <div className="relative flex items-center h-full">
                    <button
                      onClick={() => setAdminMenuOpen(!adminMenuOpen)}
                      className={`inline-flex items-center gap-1 px-1 pt-1 border-b-2 text-sm font-medium transition-colors h-full cursor-pointer
                        ${adminMenuOpen
                          ? 'border-primary-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                        }
                      `}
                    >
                      Admin
                      <svg className={`w-4 h-4 transition-transform ${adminMenuOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {adminMenuOpen && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setAdminMenuOpen(false)} />
                        <div className="absolute left-0 top-full mt-0 w-48 bg-white rounded-md shadow-lg border border-gray-200 z-20">
                          <div className="py-1">
                            {adminItems.map((item) => (
                              <Link
                                key={item.href}
                                href={item.href}
                                onClick={() => setAdminMenuOpen(false)}
                                className={`block px-4 py-2 text-sm transition-colors
                                  ${pathname === item.href
                                    ? 'bg-primary-50 text-primary-700'
                                    : 'text-gray-700 hover:bg-gray-100'
                                  }
                                `}
                              >
                                {item.label}
                              </Link>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right side - Season/Gameweek */}
            <div className="flex items-center">
              {user?.role === 'admin' ? (
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">Season:</span>
                    <span className="px-2 py-1 text-sm font-semibold text-gray-900">
                      {currentSeason ? `${currentSeason}/${(currentSeason + 1).toString().slice(-2)}` : '...'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500">GW:</span>
                    <select
                      value={currentGameweek || ''}
                      onChange={(e) => handleGameweekChange(e.target.value)}
                      disabled={isUpdating || currentGameweek === null}
                      className="px-2 py-1 border border-gray-300 rounded text-sm font-semibold focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                    >
                      {currentGameweek === null ? (
                        <option value="">...</option>
                      ) : (
                        Array.from({ length: 38 }, (_, i) => i + 1).map((w) => (
                          <option key={w} value={w}>{w}</option>
                        ))
                      )}
                    </select>
                  </div>
                </div>
              ) : currentGameweek !== null && (
                <div className="text-sm text-gray-600">
                  {currentSeason && `${currentSeason}/${(currentSeason + 1).toString().slice(-2)} - `}
                  GW {currentGameweek}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
