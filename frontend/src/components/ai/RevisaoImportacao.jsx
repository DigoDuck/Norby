import { useId, useState } from "react";
import { Link } from "react-router-dom";

import { importsApi } from "@/api/imports";
import { Button } from "@/components/ui/button";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/categories";
import {
  categoriaPara, duplicada, efeitoNoSaldo, jaNoSaldoPorPadrao, linhasIniciais,
  montarConfirmacao, prontaParaLancar, totais, totaisDoArquivo,
} from "@/lib/importacao";
import { apiErrorMessage, formatBRL, formatDateBR, formatSinal, inputCls } from "@/lib/utils";

const OPCOES = [
  { value: "EXPENSE", label: "Despesa" },
  { value: "INCOME", label: "Receita" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "IGNORE", label: "Ignorar" },
];
const TIPO_DOCUMENTO = { CARD_INVOICE: "na sua fatura", ACCOUNT_STATEMENT: "no seu extrato" };
const selectCls = `${inputCls} h-8 py-0 text-xs`;

/**
 * Cartão de revisão da importação, dentro da conversa (spec B). Nada entra no
 * Extrato sem o clique em "Lançar". Controles nativos de propósito: são até
 * 300 linhas, e o Select do Base UI pesa nessa quantidade.
 */
export default function RevisaoImportacao({ previa, carteiras }) {
  const walletSelectId = useId();
  const [walletId, setWalletId] = useState(previa.default_wallet_id ?? "");
  const [linhas, setLinhas] = useState(() => linhasIniciais(previa, previa.default_wallet_id ?? ""));
  const carteira = carteiras.find((c) => c.id === walletId);
  const [jaNoSaldo, setJaNoSaldo] = useState(() => jaNoSaldoPorPadrao(carteira, linhas));
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [resultado, setResultado] = useState(null);

  const lancaveis = linhas.filter((l) => l.marcada && l.launch_as !== "IGNORE").length;
  const motivoId = useId();
  const semDestino = linhas.filter(
    (l) => l.marcada && l.launch_as === "TRANSFER" && (!l.transfer_wallet_id || l.transfer_wallet_id === walletId),
  ).length;
  const motivo = !walletId
    ? "Escolha onde lançar."
    : semDestino > 0
      ? `Escolha a carteira de destino de ${semDestino} ${semDestino === 1 ? "transferência" : "transferências"}.`
      : lancaveis === 0
        ? "Marque ao menos um lançamento."
        : null;
  const { entradas, saidas } = totais(linhas);
  const doArquivo = totaisDoArquivo(linhas);

  function trocarCarteira(id) {
    const novas = linhasIniciais(previa, id);
    setWalletId(id);
    setLinhas(novas);
    setJaNoSaldo(jaNoSaldoPorPadrao(carteiras.find((c) => c.id === id), novas));
  }

  function alterar(id, mudanca) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...mudanca } : l)));
  }

  function trocarDestino(linha, launchAs) {
    alterar(linha.id, {
      launch_as: launchAs,
      category: launchAs === "EXPENSE" || launchAs === "INCOME" ? categoriaPara(launchAs, linha.category) : linha.category,
      // Tirar do "Ignorar" é decidir lançar: a linha passa a contar.
      marcada: linha.launch_as === "IGNORE" && launchAs !== "IGNORE" ? true : linha.marcada,
    });
  }

  async function lancar() {
    setErro(null);
    setEnviando(true);
    try {
      const res = await importsApi.confirm(montarConfirmacao(walletId, jaNoSaldo, linhas));
      setResultado(res.data);
    } catch (err) {
      setErro(apiErrorMessage(err, "Não foi possível lançar. Tente novamente."));
    } finally {
      setEnviando(false);
    }
  }

  if (resultado) {
    const total = resultado.transactions + resultado.transfers;
    return (
      <div role="status" className="inset-panel rounded-tl-md px-4 py-3 text-[14px] text-content">
        <p>
          {total} {total === 1 ? "lançamento" : "lançamentos"} na {carteira?.name}.{" "}
          <Link to="/transactions" className="font-medium text-accent underline-offset-2 hover:underline">
            Ver no Extrato
          </Link>
        </p>
      </div>
    );
  }

  const antes = Number(carteira?.balance ?? 0);
  const depois = antes + efeitoNoSaldo(linhas);

  return (
    <div className="inset-panel w-full rounded-tl-md p-4 text-[14px] text-content">
      <p className="font-medium">
        Encontrei {previa.items.length} {previa.items.length === 1 ? "lançamento" : "lançamentos"} {TIPO_DOCUMENTO[previa.document_type]}.
      </p>
      {previa.ignored > 0 && (
        <p className="mt-1 text-xs text-content-2">
          {previa.ignored} {previa.ignored === 1 ? "linha não pôde ser lida" : "linhas não puderam ser lidas"} e ficou de fora.
        </p>
      )}
      {previa.format === "pdf" && (
        <p className="mt-1 text-xs text-content-2">
          PDF é lido com menos precisão. Confira os totais com o banco, ou envie em CSV ou OFX.
        </p>
      )}

      <div className="mt-3">
        <label htmlFor={walletSelectId} className="block text-xs font-medium text-content-2 mb-1.5">
          Lançar em
        </label>
        <select
          id={walletSelectId}
          value={walletId}
          onChange={(e) => trocarCarteira(e.target.value)}
          className={selectCls}
        >
          <option value="">Escolha a carteira</option>
          {carteiras.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <ul className="mt-3 max-h-80 divide-y divide-line/[0.08] overflow-y-auto">
        {linhas.map((linha) => (
          <li key={linha.id} className="flex flex-wrap items-center gap-2 py-2">
            <input
              type="checkbox"
              aria-label={`Incluir ${linha.description}`}
              checked={linha.marcada}
              onChange={(e) => alterar(linha.id, { marcada: e.target.checked })}
            />
            <span className="w-12 text-xs text-content-3 tnum">{formatDateBR(linha.date).slice(0, 5)}</span>
            <span className="min-w-0 flex-1 truncate" title={linha.description}>{linha.description}</span>
            {walletId && duplicada(linha, walletId) && <span className="chip-neutral">já lançado</span>}
            <span className="tnum text-sm font-medium">{formatSinal(linha.amount, linha.direction === "IN")}</span>
            <div className="flex w-full gap-2 pl-6">
              <select
                aria-label={`Lançar como: ${linha.description}`}
                value={linha.launch_as}
                onChange={(e) => trocarDestino(linha, e.target.value)}
                className={selectCls}
              >
                {OPCOES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              {(linha.launch_as === "EXPENSE" || linha.launch_as === "INCOME") && (
                <select
                  aria-label={`Categoria: ${linha.description}`}
                  value={linha.category ?? "Outros"}
                  onChange={(e) => alterar(linha.id, { category: e.target.value })}
                  className={selectCls}
                >
                  {(linha.launch_as === "INCOME" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              )}
              {linha.launch_as === "TRANSFER" && (
                <select
                  aria-label={`Destino: ${linha.description}`}
                  value={linha.transfer_wallet_id ?? ""}
                  onChange={(e) => alterar(linha.id, { transfer_wallet_id: e.target.value || null })}
                  className={selectCls}
                >
                  <option value="">Para qual carteira?</option>
                  {carteiras.filter((c) => c.id !== walletId).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div role="group" aria-label="Totais da importação" className="mt-3 space-y-1 text-sm">
        <div role="group" aria-label="No arquivo" className="flex flex-wrap gap-x-4">
          <span className="text-content-2">No arquivo</span>
          <span>Entradas <strong className="tnum">{formatBRL(doArquivo.entradas)}</strong></span>
          <span>Saídas <strong className="tnum">{formatBRL(doArquivo.saidas)}</strong></span>
        </div>
        <div role="group" aria-label="Vão entrar" className="flex flex-wrap gap-x-4">
          <span className="text-content-2">Vão entrar</span>
          <span>Entradas <strong className="tnum">{formatBRL(entradas)}</strong></span>
          <span>Saídas <strong className="tnum">{formatBRL(saidas)}</strong></span>
        </div>
      </div>

      {carteira && (
        <div className="mt-2 text-xs text-content-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={jaNoSaldo} onChange={(e) => setJaNoSaldo(e.target.checked)} />
            Esses lançamentos já estão no meu saldo atual
          </label>
          <p className="mt-1 tnum">
            {jaNoSaldo
              ? `Saldo (${carteira.name}) não muda: ${formatBRL(antes)}`
              : `Saldo (${carteira.name}): ${formatBRL(antes)} → ${formatBRL(depois)}`}
          </p>
        </div>
      )}

      {erro && <p role="alert" className="mt-2 text-xs text-danger">{erro}</p>}

      <Button
        className="mt-3 font-medium"
        disabled={enviando || !prontaParaLancar(walletId, linhas)}
        onClick={lancar}
        aria-describedby={motivo && !enviando ? motivoId : undefined}
      >
        {enviando ? "Lançando…" : `Lançar ${lancaveis} ${lancaveis === 1 ? "lançamento" : "lançamentos"}`}
      </Button>
      {motivo && !enviando && (
        <p id={motivoId} className="mt-1.5 text-xs text-content-2">{motivo}</p>
      )}
    </div>
  );
}
