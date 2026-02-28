import React from 'react';
import { auth } from '@/lib/api';
import { Droplets, Shield, TrendingUp, MessageSquareHeart } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function Login() {
  const urlParams = new URLSearchParams(window.location.search);
  const error = urlParams.get('error');

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-red-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo & Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500 to-red-600 shadow-lg mb-4">
            <Droplets className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Blutwerte</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">Dein persönlicher Gesundheits-Tracker</p>
        </div>

        {/* Login card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Willkommen zurück</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-6">
            Melde dich mit deinem Konto an, um auf deine Blutwerte zuzugreifen.
          </p>

          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm">
              Anmeldung fehlgeschlagen: {error.replace(/_/g, ' ')}
            </div>
          )}

          <Button
            onClick={() => auth.login()}
            className="w-full justify-center py-3"
            size="lg"
          >
            <Shield className="w-5 h-5" />
            Mit OIDC anmelden
          </Button>

          <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
            Deine Daten werden sicher gespeichert und niemals geteilt.
          </p>
        </div>

        {/* Features */}
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { icon: TrendingUp, label: 'Verläufe', desc: 'Deine Werte im Zeitverlauf' },
            { icon: Shield, label: 'Sicher', desc: 'OIDC-geschützter Zugang' },
            { icon: MessageSquareHeart, label: 'KI-Doktor', desc: 'KI erklärt deine Werte' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="text-center">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/20 mb-2">
                <Icon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">{label}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
