"""
routers/scheduled_push.py
──────────────────────────
GET  /admin/scheduled-push         — joriy sozlamalar
PATCH /admin/scheduled-push        — sozlamalarni yangilash
POST /admin/scheduled-push/run-now — qo'lda ishga tushirish
"""
from fastapi import APIRouter, Depends, BackgroundTasks

from core.dependencies import get_current_admin
from core.scheduler import _send_dormant_reminders, get_settings, update_settings

router = APIRouter(tags=["🔔 Scheduled Push"])


@router.get("/admin/scheduled-push", summary="Rejalashtirilgan push sozlamalari")
async def get_scheduled_push(admin=Depends(get_current_admin)):
    return get_settings()


@router.patch("/admin/scheduled-push", summary="Sozlamalarni yangilash")
async def patch_scheduled_push(body: dict, admin=Depends(get_current_admin)):
    return update_settings(body)


@router.post("/admin/scheduled-push/run-now", summary="Hozir ishga tushirish")
async def run_now(background: BackgroundTasks, admin=Depends(get_current_admin)):
    background.add_task(_send_dormant_reminders)
    return {"ok": True, "message": "Dormant card eslatmalar fonda yuborilmoqda..."}
