import { useCallback, useEffect, useState } from "react";

/**
 * Carrega no mount e diz em que pé está: "loading" | "error" | "ok".
 *
 * Existe porque as telas chamavam `load()` sem estado nenhum: enquanto a
 * requisição não voltava, a lista vazia virava "Nenhuma carteira ainda" e
 * "saldo total R$ 0,00", e se ela falhasse ficava assim para sempre. Num app
 * de finanças, número inventado é pior que número ausente.
 *
 * @param {() => Promise<void>} load  estável (useCallback), senão recarrega em loop
 */
export function useLoad(load) {
  const [status, setStatus] = useState("loading");

  const reload = useCallback(async () => {
    setStatus("loading");
    try {
      await load();
      setStatus("ok");
    } catch {
      setStatus("error");
    }
  }, [load]);

  useEffect(() => {
    // Buscar no mount é o padrão sem biblioteca de data fetching; o setState
    // síncrono de `reload` só repete o "loading" que já é o estado inicial.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  return { status, reload };
}
