from datetime import date
from decimal import Decimal

import pytest

from app.services.import_service import (
    ArquivoInvalido, detectar_formato, normalizar, sugerir,
)


def test_pdf_is_detected_by_content():
    formato, _ = detectar_formato(b"%PDF-1.4 resto do arquivo")
    assert formato == "pdf"


def test_ofx_is_detected_by_header():
    formato, _ = detectar_formato(b"OFXHEADER:100\nDATA:OFXSGML\n<OFX></OFX>")
    assert formato == "ofx"


def test_anything_else_text_is_csv_even_in_latin1():
    formato, parte = detectar_formato("Data,Valor,Descrição\n".encode("latin-1"))
    assert formato == "csv"
    assert "Descrição" in parte.text


def test_empty_or_binary_files_are_rejected():
    with pytest.raises(ArquivoInvalido):
        detectar_formato(b"   \n")
    with pytest.raises(ArquivoInvalido):
        detectar_formato(b"\x89PNG\r\n\x1a\n\x00\x00")


@pytest.mark.parametrize(
    "doc, kind, direction, esperado",
    [
        ("ACCOUNT_STATEMENT", "PURCHASE", "OUT", "EXPENSE"),
        ("ACCOUNT_STATEMENT", "INCOME", "IN", "INCOME"),
        ("CARD_INVOICE", "REFUND", "IN", "INCOME"),
        ("ACCOUNT_STATEMENT", "CARD_PAYMENT", "OUT", "TRANSFER"),
        ("CARD_INVOICE", "CARD_PAYMENT", "IN", "IGNORE"),
        ("ACCOUNT_STATEMENT", "TRANSFER", "OUT", "IGNORE"),
        # Incoerência da IA (compra entrando): vale a direção.
        ("ACCOUNT_STATEMENT", "PURCHASE", "IN", "INCOME"),
    ],
)
def test_prefill_rules(doc, kind, direction, esperado):
    assert sugerir(doc, kind, direction) == esperado


def _item(**extra):
    base = {
        "date": "2026-08-10", "description": "Mercado", "amount": 52.3,
        "direction": "OUT", "kind": "PURCHASE", "category": "Alimentação",
    }
    return {**base, **extra}


def test_normalize_keeps_valid_lines_and_counts_the_rest():
    tipo, itens, ignorados = normalizar({
        "document_type": "ACCOUNT_STATEMENT",
        "items": [
            _item(),
            _item(date="10/08/2026"),          # data fora do ISO
            _item(amount=0),                   # valor zero
            _item(description="   "),          # sem descrição
            "não é um objeto",
        ],
    })
    assert tipo == "ACCOUNT_STATEMENT"
    assert ignorados == 4
    assert itens == [{
        "date": date(2026, 8, 10), "description": "Mercado", "amount": Decimal("52.30"),
        "direction": "OUT", "kind": "PURCHASE", "launch_as": "EXPENSE",
        "category": "Alimentação", "duplicate_in": [],
    }]


def test_refund_becomes_reembolso_and_unknown_category_becomes_outros():
    _, itens, _ = normalizar({
        "document_type": "CARD_INVOICE",
        "items": [
            _item(kind="REFUND", direction="IN", category="Compras"),
            _item(category="Categoria inventada"),
        ],
    })
    assert itens[0]["launch_as"] == "INCOME" and itens[0]["category"] == "Reembolso"
    assert itens[1]["category"] == "Outros"


def test_transfer_and_ignored_lines_have_no_category():
    _, itens, _ = normalizar({
        "document_type": "ACCOUNT_STATEMENT",
        "items": [_item(kind="CARD_PAYMENT"), _item(kind="TRANSFER")],
    })
    assert [i["category"] for i in itens] == [None, None]


def test_unknown_document_or_no_valid_lines_is_rejected():
    with pytest.raises(ArquivoInvalido):
        normalizar({"document_type": "OUTRA_COISA", "items": [_item()]})
    with pytest.raises(ArquivoInvalido):
        normalizar({"document_type": "ACCOUNT_STATEMENT", "items": [_item(amount=-5)]})


@pytest.mark.parametrize("itens", ["texto", 5])
def test_non_list_items_is_rejected(itens):
    with pytest.raises(ArquivoInvalido):
        normalizar({"document_type": "ACCOUNT_STATEMENT", "items": itens})


def test_more_than_300_lines_is_rejected_with_a_clear_message():
    with pytest.raises(ArquivoInvalido, match="Divida"):
        normalizar({"document_type": "ACCOUNT_STATEMENT", "items": [_item()] * 301})
