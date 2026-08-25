"""Falha se um pin de requirements*.txt não estiver refletido no .lock correspondente.

Por que existe: `requirements.txt` é o que uma pessoa edita, mas `requirements.lock`
é o que o Dockerfile instala (`backend/Dockerfile:19`) e o que o `pip-audit` lê.
Um bump que entra num e não no outro é **invisível**: o container continua rodando
a versão antiga enquanto o repositório afirma a nova, e a CI passa verde porque
testou o lock. Foi exatamente o que os PRs de pip do Dependabot produziram — eles
tocam só o `requirements.txt`.

A checagem compara pins, não regenera o lock de propósito. Regenerar acoplaria a
CI à versão do `uv` instalada lá: formatação diferente entre versões viraria
vermelho sem nenhuma mudança real. Comparar `nome==versão` não depende de rede,
de resolvedor nem de ordem.

Uso: `python scripts/check_locks.py` de dentro de `backend/`.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

# requirements-dev.txt começa com `-r requirements.txt`, então requirements-dev.lock
# tem que refletir os pins DOS DOIS. Sem a segunda fonte no par de baixo, bumpar a
# produção e regenerar só o lock de produção passaria batido.
PARES = [
    (["requirements.txt"], "requirements.lock"),
    (["requirements.txt", "requirements-dev.txt"], "requirements-dev.lock"),
]

# nome[extras]==versao — extras não aparecem no lock, então são descartados.
PIN = re.compile(r"^([A-Za-z0-9._-]+)(?:\[[^\]]+\])?==([^\s;#]+)")


def pins(path: Path) -> dict[str, str]:
    achados: dict[str, str] = {}
    for linha in path.read_text(encoding="utf-8").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith(("#", "-r ", "--")):
            continue
        m = PIN.match(linha)
        if m:
            # uv normaliza o nome no lock (underscore vira hífen, tudo minúsculo).
            achados[m.group(1).lower().replace("_", "-")] = m.group(2)
    return achados


def main() -> int:
    problemas: list[str] = []
    for nomes_fonte, nome_lock in PARES:
        lock = BACKEND / nome_lock
        if not lock.exists():
            problemas.append(f"{nome_lock} não existe")
            continue
        travados = pins(lock)
        for nome_fonte in nomes_fonte:
            fonte = BACKEND / nome_fonte
            if not fonte.exists():
                problemas.append(f"{nome_fonte} não existe")
                continue
            for pacote, versao in pins(fonte).items():
                if pacote not in travados:
                    problemas.append(f"{nome_fonte} pede {pacote}=={versao}, ausente em {nome_lock}")
                elif travados[pacote] != versao:
                    problemas.append(
                        f"{nome_fonte} pede {pacote}=={versao}, "
                        f"mas {nome_lock} trava {pacote}=={travados[pacote]}"
                    )

    if problemas:
        print("Locks fora de sincronia com os arquivos de requisito:\n", file=sys.stderr)
        for p in problemas:
            print(f"  - {p}", file=sys.stderr)
        print(
            "\nRegenere os dois e commite (de dentro de backend/):\n"
            "  uv pip compile --universal --python-version 3.12 requirements.txt -o requirements.lock\n"
            "  uv pip compile --universal --python-version 3.12 requirements-dev.txt -o requirements-dev.lock",
            file=sys.stderr,
        )
        return 1

    print("Locks em dia com requirements.txt e requirements-dev.txt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
