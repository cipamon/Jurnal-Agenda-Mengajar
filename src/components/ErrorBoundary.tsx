import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
  detail: string | null;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      detail: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Terjadi kesalahan saat memproses data aplikasi.';
    let detail: string | null = error.message || null;

    try {
      const parsed = JSON.parse(error.message) as {
        error?: string;
        operationType?: string;
        path?: string;
      };
      if (parsed && typeof parsed === 'object' && parsed.error) {
        readable = `Akses database Firebase gagal (${parsed.operationType || 'operasi'} pada ${
          parsed.path || 'dokumen'
        }): ${parsed.error}`;
      }
    } catch {
      if (error.message) readable = error.message;
    }

    return {
      hasError: true,
      message: readable,
      detail,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Uncaught Portal E-Guru error:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white rounded-xl border border-rose-200 p-6 shadow-sm space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-50 border border-rose-200 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h1 className="text-base font-bold text-slate-900">
                  Gangguan Sinkronisasi / Aplikasi
                </h1>
                <p className="text-xs text-slate-600 leading-relaxed">{this.state.message}</p>
              </div>
            </div>

            {this.state.detail && (
              <pre className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600 overflow-x-auto max-h-40">
                {this.state.detail}
              </pre>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Muat Ulang Aplikasi</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
