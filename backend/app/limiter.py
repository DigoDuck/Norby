from slowapi import Limiter
from slowapi.util import get_remote_address

# Limiter compartilhado (chave = IP do cliente). Importado pelo main e pelos routers.
limiter = Limiter(key_func=get_remote_address)
