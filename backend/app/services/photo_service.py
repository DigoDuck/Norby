"""Foto de perfil: valida, corta e encolhe (issue #35).

Decisão travada no #15: aceita até 2 MB, redimensiona NO SERVIDOR para 128x128
WebP (~8 KB) e guarda só o resultado. Guardar o ORIGINAL é o que estoura o free
tier do Neon — não o fato de morar no Postgres.

Função pura sobre bytes, sem sessão nem HTTP: quem traduz as recusas para
status é o handler no main, como todo service deste repo.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

LADO = 128
MAX_BYTES = 2 * 1024 * 1024

# Teto de PIXELS, que é diferente do teto de bytes. Um PNG de poucos KB pode
# decodificar para centenas de megapixels e derrubar o processo por memória
# antes de qualquer validação nossa rodar — o teto de bytes não protege disso.
# 40 MP passa folgado por qualquer foto de celular (48 MP é topo de linha).
MAX_PIXELS = 40_000_000

# Só o que dá para receber de um seletor de arquivo de verdade. O formato é
# lido do CONTEÚDO pelo Pillow; o content-type declarado no upload não é levado
# a sério em lugar nenhum, porque é campo controlado por quem envia.
FORMATOS = frozenset({"PNG", "JPEG", "WEBP", "GIF", "BMP"})


class PhotoTooLarge(Exception):
    """Passou do teto de bytes."""


class PhotoInvalid(Exception):
    """Não é imagem, é formato que não aceitamos, ou é grande demais em pixels."""


def processar_foto(dados: bytes) -> bytes:
    """Bytes recebidos -> WebP quadrado de 128x128.

    O teto de bytes é conferido ANTES de decodificar: decodificar primeiro para
    depois reclamar do tamanho é exatamente o que um arquivo hostil quer.
    """
    if len(dados) > MAX_BYTES:
        raise PhotoTooLarge(f"A imagem deve ter no máximo {MAX_BYTES // (1024 * 1024)} MB")

    try:
        img = Image.open(io.BytesIO(dados))
        if img.format not in FORMATOS:
            raise PhotoInvalid("Formato de imagem não aceito")
        largura, altura = img.size
        if largura * altura > MAX_PIXELS:
            raise PhotoInvalid("Imagem grande demais")

        # exif_transpose ANTES do corte: sem isso a foto de retrato tirada no
        # celular sai deitada, porque a rotação vive só no EXIF.
        img = ImageOps.exif_transpose(img)
        # `fit` corta pelo centro em vez de achatar. Espremer um retrato para
        # quadrado deforma o rosto, que é o único conteúdo que importa aqui.
        img = ImageOps.fit(img.convert("RGB"), (LADO, LADO))
    except Image.DecompressionBombError as erro:
        # O Pillow tem teto próprio (~178 MP) e ele dispara ANTES do nosso, com
        # um tipo que não é OSError nem ValueError. Sem este ramo a bomba virava
        # 500 em vez de recusa limpa.
        raise PhotoInvalid("Imagem grande demais") from erro
    except (UnidentifiedImageError, OSError, ValueError) as erro:
        raise PhotoInvalid("Não foi possível ler a imagem") from erro

    saida = io.BytesIO()
    # Sem `exif=`: o WebP sai limpo. Foto de celular carrega EXIF com GPS, que
    # é dado pessoal que o usuário não sabe que está mandando e que nada aqui
    # precisa. Só o primeiro quadro de um GIF animado sobrevive, de propósito.
    img.save(saida, format="WEBP", quality=82, method=4)
    return saida.getvalue()
