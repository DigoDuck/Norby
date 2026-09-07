import asyncio

import pytest


async def make_wallet(ac, name="Main", balance=100):
    res = await ac.post("/wallets/", json={"name": name, "balance": balance})
    assert res.status_code == 201, res.text
    return res.json()


def tx_payload(wallet_id, **over):
    base = {
        "wallet_id": wallet_id,
        "type": "EXPENSE",
        "amount": "30.00",
        "category": "Food",
        "description": "Lunch",
        "date": "2026-06-10",
    }
    base.update(over)
    return base


@pytest.mark.asyncio
async def test_create_expense_decreases_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))
    assert res.status_code == 201
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 70.0


@pytest.mark.asyncio
async def test_date_is_returned_as_calendar_date_without_shift(make_auth_client):
    # A data é um dia de calendário: o que entra deve voltar igual, sem fuso.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], date="2026-06-30"))
    assert res.status_code == 201, res.text
    assert res.json()["date"] == "2026-06-30"


@pytest.mark.asyncio
async def test_create_income_increases_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    await ac.post("/transactions/", json=tx_payload(w["id"], type="INCOME", amount="50.00"))
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 150.0


@pytest.mark.asyncio
async def test_update_amount_adjusts_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()
    # 100 - 30 = 70; muda p/ 50 → 100 - 50 = 50
    res = await ac.put(f"/transactions/{tx['id']}", json={"amount": "50.00"})
    assert res.status_code == 200
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 50.0


@pytest.mark.asyncio
async def test_delete_reverts_balance(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()
    res = await ac.delete(f"/transactions/{tx['id']}")
    assert res.status_code == 204
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 100.0


@pytest.mark.asyncio
async def test_user_cannot_create_tx_in_other_users_wallet(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w_alice = await make_wallet(alice)
    res = await bob.post("/transactions/", json=tx_payload(w_alice["id"]))
    assert res.status_code == 404  # carteira não é do Bob


@pytest.mark.asyncio
async def test_user_cannot_update_other_users_tx(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    tx = (await alice.post("/transactions/", json=tx_payload(w["id"]))).json()
    res = await bob.put(f"/transactions/{tx['id']}", json={"amount": "1.00"})
    assert res.status_code == 404


@pytest.mark.asyncio
async def test_concurrent_transactions_do_not_lose_wallet_balance_updates(make_auth_client):
    # Duas transações simultâneas na MESMA carteira: sem lock (with_for_update),
    # ambas leem o saldo antigo e a última sobrescreve a outra (lost update).
    # Cada request usa sua própria sessão/transação (_override_get_db), então o
    # gather abre duas transações concorrentes de verdade no Postgres.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)

    res_a, res_b = await asyncio.gather(
        ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00")),
        ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00")),
    )
    assert res_a.status_code == 201, res_a.text
    assert res_b.status_code == 201, res_b.text

    wallets = (await ac.get("/wallets/")).json()
    # 100 - 30 - 30 = 40. Sem o lock, o saldo ficaria em 70 (uma das saídas some).
    assert float(wallets[0]["balance"]) == 40.0


@pytest.mark.asyncio
async def test_list_respects_limit_and_offset(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=1000)
    for i in range(5):
        await ac.post("/transactions/", json=tx_payload(w["id"], amount="10.00", date=f"2026-06-0{i+1}"))

    page1 = (await ac.get("/transactions/?limit=2&offset=0")).json()
    page2 = (await ac.get("/transactions/?limit=2&offset=2")).json()
    assert len(page1) == 2
    assert len(page2) == 2
    # Páginas consecutivas não se sobrepõem.
    assert {t["id"] for t in page1}.isdisjoint({t["id"] for t in page2})


@pytest.mark.asyncio
async def test_list_is_scoped_to_user(make_auth_client):
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    w = await make_wallet(alice)
    await alice.post("/transactions/", json=tx_payload(w["id"]))
    assert len((await alice.get("/transactions/")).json()) == 1
    bob_res = await bob.get("/transactions/")
    assert len(bob_res.json()) == 0
    # x-total-count precisa herdar o mesmo escopo de usuário do corpo: sem
    # isto, um bug futuro na query de contagem vazaria quantas transações de
    # Alice existem, mesmo com a lista do Bob corretamente vazia.
    assert bob_res.headers["x-total-count"] == "0"


@pytest.mark.asyncio
async def test_concurrent_updates_keep_balance_consistent_with_transaction(make_auth_client):
    # Dois PUT simultâneos na MESMA transação. Sem lock na linha da transação,
    # ambos leem amount=30, revertem 30 duas vezes e aplicam valores diferentes:
    # o saldo final deixa de corresponder ao amount que ficou gravado.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()

    res_a, res_b = await asyncio.gather(
        ac.put(f"/transactions/{tx['id']}", json={"amount": "50.00"}),
        ac.put(f"/transactions/{tx['id']}", json={"amount": "70.00"}),
    )
    assert res_a.status_code == 200, res_a.text
    assert res_b.status_code == 200, res_b.text

    # Invariante (não depende de quem commitou por último): saldo = inicial - despesa final.
    final = (await ac.get("/transactions/")).json()[0]
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 100.0 - float(final["amount"])


@pytest.mark.asyncio
async def test_rejects_amount_beyond_column_precision(make_auth_client):
    # Numeric(15,2) não guarda isso: sem teto no schema, o insert vira 500.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], amount="99999999999999999.00"))
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rejects_amount_with_extra_decimal_places(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], amount="10.123"))
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_rejects_oversized_category(make_auth_client):
    # String(100) na coluna: sem max_length no schema, vira 500.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    res = await ac.post("/transactions/", json=tx_payload(w["id"], category="c" * 300))
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_rejects_out_of_range_year(make_auth_client):
    # date(99999, 1, 1) levanta ValueError e virava 500: o month tinha faixa,
    # o year não.
    ac = await make_auth_client("Alice")
    res = await ac.get("/transactions/?month=1&year=99999")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_rejects_month_without_year(make_auth_client):
    # Antes devolvia 200 IGNORANDO o filtro em silêncio, que é pior que recusar.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac)
    await ac.post("/transactions/", json=tx_payload(w["id"], date="2026-06-10"))

    res = await ac.get("/transactions/?month=6")
    assert res.status_code == 422


@pytest.mark.asyncio
async def test_list_still_filters_with_both(make_auth_client):
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac)
    await ac.post("/transactions/", json=tx_payload(w["id"], date="2026-06-10"))
    await ac.post("/transactions/", json=tx_payload(w["id"], date="2026-07-10"))

    res = await ac.get("/transactions/?month=6&year=2026")
    assert res.status_code == 200
    assert [t["date"] for t in res.json()] == ["2026-06-10"]


@pytest.mark.asyncio
async def test_update_ignores_explicit_null(make_auth_client):
    # amount: null passa no Pydantic (Money | None) e, com exclude_unset, o None
    # era gravado numa coluna NOT NULL -> IntegrityError -> 500.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"], amount="30.00"))).json()

    res = await ac.put(f"/transactions/{tx['id']}", json={"amount": None})
    assert res.status_code == 200
    assert res.json()["amount"] == "30.00"

    # E o saldo não pode ter sido mexido por um update que não mudou nada.
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 70.0


@pytest.mark.asyncio
async def test_update_can_still_clear_description(make_auth_client):
    # description é o único campo legitimamente anulável; string vazia continua
    # sendo o caminho para limpá-lo depois da troca para exclude_none.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post("/transactions/", json=tx_payload(w["id"]))).json()
    assert tx["description"] == "Lunch"

    res = await ac.put(f"/transactions/{tx['id']}", json={"description": ""})
    assert res.status_code == 200
    assert res.json()["description"] == ""


@pytest.mark.asyncio
async def test_list_rejects_year_without_month(make_auth_client):
    # O guard cobre os dois sentidos; só o month-sem-year tinha regressão.
    ac = await make_auth_client("Alice")
    res = await ac.get("/transactions/?year=2026")
    assert res.status_code == 422



@pytest.mark.asyncio
async def test_moving_transaction_between_wallets_moves_the_money(make_auth_client):
    # O trecho mais intrincado do backend: reverte o efeito na carteira antiga e
    # aplica na nova, com dois locks e ordem documentada por causa de deadlock.
    # O front manda wallet_id no PUT, então é caminho real e não tinha teste.
    ac = await make_auth_client("Alice")
    origem = await make_wallet(ac, name="Origem", balance=100)
    destino = await make_wallet(ac, name="Destino", balance=100)

    tx = (await ac.post(
        "/transactions/", json=tx_payload(origem["id"], amount="30.00")
    )).json()

    saldos = {w["name"]: float(w["balance"]) for w in (await ac.get("/wallets/")).json()}
    assert saldos == {"Origem": 70.0, "Destino": 100.0}

    res = await ac.put(f"/transactions/{tx['id']}", json={"wallet_id": destino["id"]})
    assert res.status_code == 200, res.text
    assert res.json()["wallet_id"] == destino["id"]

    # A despesa sai da origem e passa a pesar no destino, sem sumir nem duplicar.
    saldos = {w["name"]: float(w["balance"]) for w in (await ac.get("/wallets/")).json()}
    assert saldos == {"Origem": 100.0, "Destino": 70.0}


@pytest.mark.asyncio
async def test_flipping_type_inverts_the_sign_twice(make_auth_client):
    # Mesma função do teste acima, invertendo o sinal duas vezes: reverte a
    # despesa antiga (soma de volta) e aplica a receita nova (soma outra vez).
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=100)
    tx = (await ac.post(
        "/transactions/", json=tx_payload(w["id"], type="EXPENSE", amount="30.00")
    )).json()

    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 70.0

    res = await ac.put(f"/transactions/{tx['id']}", json={"type": "INCOME"})
    assert res.status_code == 200

    # 70 + 30 (desfaz a despesa) + 30 (aplica a receita) = 130.
    wallets = (await ac.get("/wallets/")).json()
    assert float(wallets[0]["balance"]) == 130.0


@pytest.mark.asyncio
async def test_moving_to_someone_elses_wallet_is_404(make_auth_client):
    # Ownership no caminho indireto: o wallet_id vem do CORPO do PUT.
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    da_alice = await make_wallet(alice, balance=100)
    do_bob = await make_wallet(bob, balance=100)

    tx = (await alice.post(
        "/transactions/", json=tx_payload(da_alice["id"], amount="30.00")
    )).json()

    res = await alice.put(f"/transactions/{tx['id']}", json={"wallet_id": do_bob["id"]})
    assert res.status_code == 404

    # E o saldo do Bob não foi tocado.
    wallets_bob = (await bob.get("/wallets/")).json()
    assert float(wallets_bob[0]["balance"]) == 100.0


@pytest.mark.asyncio
async def test_list_returns_total_count_header(make_auth_client):
    # A página de Relatórios precisa saber quantas transações existem no total,
    # não só quantas couberam no limit — senão esconde dado sem avisar.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=1000)
    for _ in range(3):
        await ac.post("/transactions/", json=tx_payload(w["id"], amount="10.00"))

    res = await ac.get("/transactions/?limit=2")

    assert res.status_code == 200
    assert len(res.json()) == 2
    assert res.headers["x-total-count"] == "3"


@pytest.mark.asyncio
async def test_total_count_respects_filters(make_auth_client):
    # A contagem tem que ser a do filtro aplicado, não a da tabela inteira.
    ac = await make_auth_client("Alice")
    w = await make_wallet(ac, balance=1000)
    await ac.post("/transactions/", json=tx_payload(w["id"], type="EXPENSE"))
    await ac.post("/transactions/", json=tx_payload(w["id"], type="INCOME", amount="5.00"))

    res = await ac.get("/transactions/?type=INCOME")

    assert res.headers["x-total-count"] == "1"


async def _carteira(ac, nome="Main"):
    res = await ac.post("/wallets/", json={"name": nome, "balance": "1000.00"})
    assert res.status_code == 201, res.text
    return res.json()["id"]


async def _transacao(ac, wallet_id, *, category, description, amount="10.00"):
    res = await ac.post(
        "/transactions/",
        json={
            "wallet_id": wallet_id,
            "type": "EXPENSE",
            "amount": amount,
            "category": category,
            "description": description,
            "date": "2026-09-01",
        },
    )
    assert res.status_code == 201, res.text
    return res.json()["id"]


@pytest.mark.asyncio
async def test_search_matches_description_and_category(make_auth_client):
    alice = await make_auth_client("Alice")
    w = await _carteira(alice)
    await _transacao(alice, w, category="Mercado", description="Feira da semana")
    await _transacao(alice, w, category="Transporte", description="Uber para o centro")

    por_descricao = await alice.get("/transactions/", params={"q": "feira"})
    assert [t["description"] for t in por_descricao.json()] == ["Feira da semana"]

    por_categoria = await alice.get("/transactions/", params={"q": "transp"})
    assert [t["category"] for t in por_categoria.json()] == ["Transporte"]


@pytest.mark.asyncio
async def test_search_ignores_case_and_accents(make_auth_client):
    # As categorias reais do app têm acento ("Alimentação", "Saúde", "Salário")
    # e quem digita no celular normalmente não põe. Sem isto a busca não acha
    # justamente as categorias que o próprio app criou.
    alice = await make_auth_client("Alice")
    w = await _carteira(alice)
    await _transacao(alice, w, category="Alimentação", description="Almoço no Sabor & Saúde")

    for termo in ("alimentacao", "ALIMENTAÇÃO", "saude", "almoco"):
        res = await alice.get("/transactions/", params={"q": termo})
        assert len(res.json()) == 1, (termo, res.text)


@pytest.mark.asyncio
async def test_search_combines_with_the_existing_filters_and_the_total(make_auth_client):
    # Busca DENTRO do filtro ativo, não no lugar dele. E o X-Total-Count conta
    # o resultado da busca: sem isso a paginação diria "1 de 7 páginas" para um
    # resultado de uma linha.
    alice = await make_auth_client("Alice")
    w = await _carteira(alice)
    await _transacao(alice, w, category="Mercado", description="Feira da semana")
    receita = await alice.post(
        "/transactions/",
        json={
            "wallet_id": w, "type": "INCOME", "amount": "50.00",
            "category": "Mercado", "description": "Feira devolvida", "date": "2026-09-01",
        },
    )
    assert receita.status_code == 201, receita.text

    res = await alice.get("/transactions/", params={"q": "feira", "type": "EXPENSE"})
    assert len(res.json()) == 1
    assert res.json()[0]["type"] == "EXPENSE"
    assert res.headers["X-Total-Count"] == "1"


@pytest.mark.asyncio
async def test_search_treats_wildcards_as_text_and_stays_scoped_to_the_user(make_auth_client):
    # `%` sem escape casaria com tudo, transformando a busca num "listar tudo"
    # disfarçado. E a busca nunca pode furar o escopo do dono.
    alice = await make_auth_client("Alice")
    bob = await make_auth_client("Bob")
    wa = await _carteira(alice)
    wb = await _carteira(bob, "Bob Main")
    await _transacao(alice, wa, category="Mercado", description="Feira da semana")
    await _transacao(bob, wb, category="Mercado", description="Feira do Bob")

    curinga = await alice.get("/transactions/", params={"q": "%"})
    assert curinga.json() == []

    dela = await alice.get("/transactions/", params={"q": "feira"})
    assert [t["description"] for t in dela.json()] == ["Feira da semana"]


@pytest.mark.asyncio
async def test_search_does_not_break_on_a_null_description(make_auth_client):
    # `translate(NULL)` é NULL e NULL LIKE nunca é verdadeiro: uma transação
    # sem descrição não pode quebrar a busca nem aparecer como falso positivo.
    alice = await make_auth_client("Alice")
    w = await _carteira(alice)
    await _transacao(alice, w, category="Mercado", description=None)

    por_categoria = await alice.get("/transactions/", params={"q": "mercado"})
    assert por_categoria.status_code == 200
    assert len(por_categoria.json()) == 1

    por_termo_qualquer = await alice.get("/transactions/", params={"q": "feira"})
    assert por_termo_qualquer.status_code == 200
    assert por_termo_qualquer.json() == []
