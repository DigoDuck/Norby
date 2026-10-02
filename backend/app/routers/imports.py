import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, get_db, require_ai_access
from app.limiter import limiter, user_key
from app.models.sql_models import User
from app.schemas.imports import ImportConfirm, ImportPreview, ImportResult
from app.services.import_service import ArquivoInvalido, ExtracaoFalhou, confirmar, ler_arquivo
from app.services.plan_service import PlanRefused

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/imports", tags=["Imports"])


@router.post(
    "/statement",
    response_model=ImportPreview,
    responses={
        413: {"description": "Arquivo acima de 1 MB"},
        422: {"description": "Arquivo vazio, em formato não suportado ou sem lançamentos"},
        503: {"description": "A IA não conseguiu ler o arquivo agora"},
    },
)
# Cada leitura custa de 18 a 37 mil tokens (teste com 126 lançamentos); a cota
# diária segura o dia, este teto segura a rajada.
@limiter.limit("5/minute", key_func=user_key)
async def preview_statement(
    request: Request,
    current_user: User = Depends(require_ai_access),
    db: AsyncSession = Depends(get_db),
):
    # Corpo cru, como o upload de foto: o BodySizeLimitMiddleware já cortou em
    # 413 tudo acima de 1 MB antes de chegar aqui.
    conteudo = await request.body()
    try:
        return await ler_arquivo(db, current_user, conteudo)
    except ArquivoInvalido as erro:
        raise HTTPException(status_code=422, detail=str(erro))
    except PlanRefused:
        # Cota diária: sobe até o handler do main (403 com o código).
        raise
    except ExtracaoFalhou:
        raise HTTPException(
            status_code=503,
            detail="Não consegui ler o arquivo agora. Tente novamente em instantes.",
        )
    except Exception:
        logger.exception("Falha ao ler arquivo de importação (user=%s)", current_user.id)
        raise HTTPException(
            status_code=503,
            detail="Não consegui ler o arquivo agora. Tente novamente em instantes.",
        )


@router.post(
    "/statement/confirm",
    response_model=ImportResult,
    status_code=status.HTTP_201_CREATED,
)
# Não chama a IA: fica fora do portão de IA e passa só pelo de carteira.
@limiter.limit("30/minute", key_func=user_key)
async def confirm_statement(
    request: Request,
    payload: ImportConfirm,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await confirmar(db, current_user, payload)
