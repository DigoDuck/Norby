"""Categorias de lançamento, espelho de frontend/src/lib/categories.js.

A lista mora num JSON para o teste do frontend (categories.sync.test.js)
comparar as duas e acusar deriva: a importação valida categoria no backend, e
uma categoria nova só no front viraria 422 sem ninguém entender por quê.
"""
import json
from pathlib import Path

_DADOS = json.loads(Path(__file__).with_name("categories.json").read_text(encoding="utf-8"))

EXPENSE_CATEGORIES: tuple[str, ...] = tuple(_DADOS["expense"])
INCOME_CATEGORIES: tuple[str, ...] = tuple(_DADOS["income"])
