import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

// O script inline do index.html aplica data-theme no <html> antes do bundle.
// Sob a CSP de produção ele só executa se o hash dele estiver em script-src.
// Quando os dois divergiram, o navegador bloqueou o script, o atributo nunca
// foi aplicado, TODO token --* ficou indefinido e a aplicação subiu sem
// superfície, sem cor de gráfico e sem fundo. Nada no build acusou.
// Este teste existe para essa divergência quebrar aqui, e não em produção.
describe("CSP de produção", () => {
  function cspDeProducao() {
    const vercel = JSON.parse(readFileSync(resolve("vercel.json"), "utf8"));
    return vercel.headers
      .flatMap((entrada) => entrada.headers)
      .find((cabecalho) => cabecalho.key === "Content-Security-Policy").value;
  }

  function diretiva(csp, nome) {
    return csp
      .split(";")
      .map((parte) => parte.trim())
      .find((parte) => parte.startsWith(`${nome} `));
  }

  it("autoriza o script inline de tema pelo hash exato", () => {
    const html = readFileSync(resolve("index.html"), "utf8");
    const inline = html.match(/<script>([\s\S]*?)<\/script>/);

    expect(inline, "o script inline de tema sumiu do index.html").not.toBeNull();

    // Normaliza CRLF antes de somar: o parser HTML converte quebra de linha
    // para LF antes de tokenizar, então é sobre o texto em LF que o navegador
    // calcula o hash. Num checkout Windows (core.autocrlf=true) o arquivo em
    // disco vem com CRLF e o hash cru daria diferente do de produção, onde a
    // Vercel faz checkout Linux. O blob no git é LF nos dois casos.
    const fonte = inline[1].replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const hash = createHash("sha256").update(fonte, "utf8").digest("base64");

    expect(diretiva(cspDeProducao(), "script-src")).toContain(`'sha256-${hash}'`);
  });

  it("não afrouxa script-src com unsafe-inline", () => {
    // Liberar inline em bloco resolveria o sintoma e desfaria o endurecimento:
    // qualquer injeção de script passaria a executar. O hash autoriza um
    // conteúdo exato, e só ele.
    expect(diretiva(cspDeProducao(), "script-src")).not.toContain("unsafe-inline");
  });
});
