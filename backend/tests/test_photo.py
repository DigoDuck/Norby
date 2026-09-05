"""Foto de perfil (issue #35).

A decisão travada no #15: aceita até 2 MB, redimensiona NO SERVIDOR para
128x128 WebP (~8 KB) e guarda o resultado como `bytea` na linha do usuário.
Guardar o ORIGINAL é o que estoura o free tier do Neon — não o fato de morar
no Postgres.
"""

import io

import pytest
from PIL import Image

from app.services.photo_service import (
    LADO,
    MAX_BYTES,
    PhotoInvalid,
    PhotoTooLarge,
    processar_foto,
)


def _imagem(formato="PNG", tamanho=(600, 400), cor=(200, 30, 30)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", tamanho, cor).save(buf, format=formato)
    return buf.getvalue()


def test_a_photo_comes_back_as_a_square_webp():
    saida = processar_foto(_imagem())
    img = Image.open(io.BytesIO(saida))
    assert img.format == "WEBP"
    assert img.size == (LADO, LADO)


def test_the_result_is_tiny_next_to_the_original():
    # O ponto do redimensionamento no servidor: o que vai para o banco é ~8 KB,
    # não os megabytes que o usuário enviou.
    original = _imagem(tamanho=(2000, 2000))
    saida = processar_foto(original)
    assert len(saida) < len(original) / 10
    assert len(saida) < 30 * 1024


def test_a_rectangle_is_cropped_not_squashed():
    """Achatar um retrato para quadrado deforma o rosto. Corta pelo centro.

    Só conferir o TAMANHO da saída não testa isto — esmagar também devolve
    128x128 (foi o que a primeira versão deste teste fazia). O sinal tem de ser
    o conteúdo: uma faixa preta na ponta esquerda de uma imagem larga some no
    corte central e sobrevive no esmagamento.
    """
    larga = Image.new("RGB", (1000, 250), (255, 255, 255))
    larga.paste(Image.new("RGB", (250, 250), (0, 0, 0)), (0, 0))
    buf = io.BytesIO()
    larga.save(buf, format="PNG")

    saida = Image.open(io.BytesIO(processar_foto(buf.getvalue()))).convert("RGB")
    assert saida.size == (LADO, LADO)
    # Canto esquerdo da saída: branco se cortou pelo centro, preto se esmagou.
    assert min(saida.getpixel((4, LADO // 2))) > 200


@pytest.mark.asyncio
async def test_the_blob_does_not_ride_along_on_every_query(db_session):
    """`photo` é deferido no modelo.

    Sem isso, TODA requisição autenticada arrastaria o blob do Postgres, porque
    o `get_current_user` faz `select(User)` a cada uma. É a razão de a coluna
    existir deferida, e nada mais no código torna essa escolha visível.
    """
    from sqlalchemy import inspect as sa_inspect, select

    from app.models.sql_models import User

    user = User(name="Al", email="al_defer@t.com", password_hash="x")
    db_session.add(user)
    await db_session.commit()
    db_session.expunge_all()

    carregado = (
        await db_session.execute(select(User).where(User.id == user.id))
    ).scalar_one()
    assert "photo" in sa_inspect(carregado).unloaded


def test_something_that_is_not_an_image_is_refused():
    with pytest.raises(PhotoInvalid):
        processar_foto(b"isto aqui nao e uma imagem, e texto puro")


def test_a_lying_content_type_does_not_help():
    # A validação sniffa o conteúdo; o tipo declarado no upload não é levado a
    # sério em lugar nenhum.
    with pytest.raises(PhotoInvalid):
        processar_foto(b"\x89PNG\r\n\x1a\n" + b"lixo" * 100)


def test_oversize_is_refused_before_decoding():
    # O teto vale sobre os BYTES RECEBIDOS. Decodificar primeiro para depois
    # reclamar do tamanho é justamente o que um arquivo hostil quer.
    with pytest.raises(PhotoTooLarge):
        processar_foto(b"x" * (MAX_BYTES + 1))


def test_a_decompression_bomb_is_refused():
    # Um PNG de poucos KB pode virar um bitmap de centenas de megapixels.
    bomba = io.BytesIO()
    Image.new("L", (14000, 14000)).save(bomba, format="PNG")
    dados = bomba.getvalue()
    assert len(dados) < MAX_BYTES  # cabe no teto de bytes: o teto não basta
    with pytest.raises(PhotoInvalid):
        processar_foto(dados)


def test_an_image_under_pillows_own_limit_but_over_ours_is_refused():
    """O teto de 40 MP é NOSSO, e mais apertado que o do Pillow (~178 MP).

    64 MP em RGB são ~190 MB de bitmap, que num container pequeno é OOM. Sem
    este teste o teto podia ser removido sem nada ficar vermelho — o teste da
    bomba acima passa pelo teto do Pillow, não pelo nosso.
    """
    grande = io.BytesIO()
    Image.new("L", (8000, 8000)).save(grande, format="PNG")
    with pytest.raises(PhotoInvalid):
        processar_foto(grande.getvalue())


def test_a_valid_image_in_a_format_we_do_not_accept_is_refused():
    """A lista de formatos não é decoração.

    O Pillow abre dezenas de formatos, alguns com decodificadores exóticos e
    até com dependência externa (EPS chama o Ghostscript). Um TIFF perfeitamente
    válido é a prova barata: nada aqui precisa dele, então ele não entra.
    """
    tiff = io.BytesIO()
    Image.new("RGB", (100, 100), (1, 2, 3)).save(tiff, format="TIFF")
    with pytest.raises(PhotoInvalid):
        processar_foto(tiff.getvalue())


def test_an_animated_gif_becomes_a_still_frame():
    quadros = [Image.new("P", (200, 200), i) for i in (1, 2, 3)]
    buf = io.BytesIO()
    quadros[0].save(buf, format="GIF", save_all=True, append_images=quadros[1:])
    saida = processar_foto(buf.getvalue())
    img = Image.open(io.BytesIO(saida))
    assert img.format == "WEBP"
    assert getattr(img, "n_frames", 1) == 1


def test_metadata_does_not_survive():
    # Foto de celular carrega EXIF com GPS. Ela é dado pessoal que o usuário
    # não sabe que está mandando, e nada aqui precisa dela.
    buf = io.BytesIO()
    img = Image.new("RGB", (300, 300))
    exif = img.getexif()
    exif[0x9003] = "2020:01:01 00:00:00"  # DateTimeOriginal
    img.save(buf, format="JPEG", exif=exif)

    saida = processar_foto(buf.getvalue())
    assert not Image.open(io.BytesIO(saida)).getexif()


# --- As rotas ----------------------------------------------------------------
# Corpo CRU, não multipart: o teto tem de valer ANTES de o servidor materializar
# o arquivo, e é o mesmo desenho que o webhook do Stripe já usa aqui.


@pytest.mark.asyncio
async def test_upload_then_serve_then_delete(make_auth_client):
    alice = await make_auth_client("Alice")

    assert (await alice.get("/auth/me")).json()["photo_updated_at"] is None
    assert (await alice.get("/auth/me/photo")).status_code == 404

    envio = await alice.put(
        "/auth/me/photo", content=_imagem(), headers={"Content-Type": "image/png"}
    )
    assert envio.status_code == 200, envio.text
    assert envio.json()["photo_updated_at"]

    # A data viaja no payload do usuário; os BYTES nunca.
    me = (await alice.get("/auth/me")).json()
    assert me["photo_updated_at"]
    assert "photo" not in me

    servida = await alice.get("/auth/me/photo")
    assert servida.status_code == 200
    assert servida.headers["content-type"] == "image/webp"
    assert Image.open(io.BytesIO(servida.content)).size == (LADO, LADO)

    apagada = await alice.delete("/auth/me/photo")
    assert apagada.status_code == 204
    assert (await alice.get("/auth/me/photo")).status_code == 404
    assert (await alice.get("/auth/me")).json()["photo_updated_at"] is None


@pytest.mark.asyncio
async def test_the_same_photo_is_not_downloaded_twice(make_auth_client):
    # A foto é imutável até o próximo upload; sem ETag ela desceria inteira a
    # cada carga de página, para nada.
    alice = await make_auth_client("Alice")
    await alice.put("/auth/me/photo", content=_imagem())

    primeira = await alice.get("/auth/me/photo")
    etag = primeira.headers["etag"]
    assert etag

    segunda = await alice.get("/auth/me/photo", headers={"If-None-Match": etag})
    assert segunda.status_code == 304
    assert segunda.content == b""


@pytest.mark.asyncio
async def test_a_new_upload_invalidates_the_cached_one(make_auth_client):
    alice = await make_auth_client("Alice")
    await alice.put("/auth/me/photo", content=_imagem(cor=(10, 10, 200)))
    etag_antigo = (await alice.get("/auth/me/photo")).headers["etag"]

    await alice.put("/auth/me/photo", content=_imagem(cor=(10, 200, 10)))
    depois = await alice.get("/auth/me/photo", headers={"If-None-Match": etag_antigo})
    assert depois.status_code == 200  # e não 304 com a foto velha


@pytest.mark.asyncio
async def test_junk_is_refused_with_a_message_not_a_500(make_auth_client):
    alice = await make_auth_client("Alice")
    res = await alice.put("/auth/me/photo", content=b"nao sou imagem")
    assert res.status_code == 400
    assert res.json()["detail"]


@pytest.mark.asyncio
async def test_oversize_is_refused_by_the_route(make_auth_client):
    alice = await make_auth_client("Alice")
    res = await alice.put("/auth/me/photo", content=b"x" * (MAX_BYTES + 1))
    assert res.status_code == 413


@pytest.mark.asyncio
async def test_the_photo_endpoint_requires_a_token(client, make_auth_client):
    # `<img src>` não manda header de autorização, então a tentação seria abrir
    # esta rota. Ela continua fechada, e o frontend baixa com o token.
    alice = await make_auth_client("Alice")
    await alice.put("/auth/me/photo", content=_imagem())
    assert (await client.get("/auth/me/photo")).status_code == 401


@pytest.mark.asyncio
async def test_the_photo_travels_in_the_lgpd_export(make_auth_client, mongo):
    # Dado pessoal do usuário. O export é o direito de portabilidade: deixar a
    # foto de fora entregaria um dump incompleto.
    import base64

    alice = await make_auth_client("Alice")
    await alice.put("/auth/me/photo", content=_imagem())

    dump = (await alice.get("/auth/me/export")).json()
    assert dump["profile"]["photo_webp_base64"]
    bruto = base64.b64decode(dump["profile"]["photo_webp_base64"])
    assert Image.open(io.BytesIO(bruto)).format == "WEBP"
