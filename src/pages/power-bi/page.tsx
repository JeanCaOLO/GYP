import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';

const POWER_BI_REFRESH_URL =
  'https://default486c98d673354bc18e434b25f417db.44.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/18/workflows/564dee8e3e5345369ca8ca2d7c2004b3/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=W9V0SSNP_LBrPRtXVyyVN2-R7m5qVGNReQgSZxQdrVM';

export default function PowerBiPage() {
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleRefresh = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(POWER_BI_REFRESH_URL, { method: 'POST', mode: 'no-cors' });
      addToast('success', 'Solicitud de refresco enviada. Power BI se está actualizando.');
    } catch {
      addToast('error', 'No se pudo enviar la solicitud. Intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground-950">Power BI</h1>
        <p className="text-sm text-foreground-700">
          Refrescá el modelo semántico para ver los datos actualizados en los reportes
        </p>
      </div>

      <div className="flex items-center justify-center py-16">
        <div className="w-full max-w-xl rounded-2xl bg-background-50 border border-background-200 p-8 flex flex-col items-center gap-6 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
            <i className="ri-bar-chart-2-line text-white text-3xl w-8 h-8 flex items-center justify-center"></i>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-foreground-950">Modelo Semántico</h2>
            <p className="text-sm text-foreground-700 mt-1">
              Al presionar el botón se ejecuta el flujo que refresca los datos del modelo semántico
              en Power BI. Los cambios que hiciste en el sistema van a aparecer en los reportes.
            </p>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-lg font-semibold px-10 py-5 whitespace-nowrap transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <i className="ri-loader-4-line animate-spin text-2xl w-6 h-6 flex items-center justify-center"></i>
                Refrescando...
              </>
            ) : (
              <>
                <i className="ri-refresh-line text-2xl w-6 h-6 flex items-center justify-center"></i>
                Refrescar Modelo Semántico Power BI
              </>
            )}
          </button>

          {loading && (
            <p className="text-xs text-foreground-600">
              Enviando solicitud al flujo de Power Automate...
            </p>
          )}
        </div>
      </div>
    </div>
  );
}