import { FileText } from 'lucide-react';
import TestExtraction from './pages/TestExtraction';

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <FileText className="size-6 text-slate-900" />
          <div>
            <h1 className="font-semibold text-slate-900">OCRDEMO</h1>
            <p className="text-xs text-slate-500">Banco de pruebas — extracción de facturas con Gemini</p>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <TestExtraction />
      </main>
    </div>
  );
}
