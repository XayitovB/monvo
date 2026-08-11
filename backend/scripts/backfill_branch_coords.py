"""
scripts/backfill_branch_coords.py
─────────────────────────────────
Koordinatasi (lat/lng) yo'q, lekin manzili bor filiallarni geokodlab
to'ldiradi. Bu filiallar mijoz ilovasidagi xaritada ko'rinmaydi —
skript ularni ko'rinadigan qiladi.

Ishga tushirish (backend papkasidan):
    python -m scripts.backfill_branch_coords            # barcha filiallar
    python -m scripts.backfill_branch_coords --merchant 12   # bitta merchant

Nominatim rate-limit (~1 req/sek) hurmat qilinadi.
"""
import argparse
import asyncio

from sqlalchemy import or_, select

from core.geocode import geocode_address
from database import AsyncSessionLocal
from models import Merchant, MerchantBranch


async def run(merchant_id: int | None = None) -> None:
    async with AsyncSessionLocal() as db:
        q = select(MerchantBranch).where(
            or_(MerchantBranch.lat.is_(None), MerchantBranch.lng.is_(None)),
            MerchantBranch.address != "",
        )
        if merchant_id is not None:
            q = q.where(MerchantBranch.merchant_id == merchant_id)
        rows = (await db.execute(q)).scalars().all()

        print(f"Koordinatasiz filiallar topildi: {len(rows)}")
        fixed = 0
        for b in rows:
            coords = await geocode_address(b.address)
            if coords:
                b.lat, b.lng = coords
                fixed += 1
                print(f"  ✓ #{b.id} {b.name!r} → {coords}")
            else:
                print(f"  ✗ #{b.id} {b.name!r} — manzildan topilmadi: {b.address!r}")
            await asyncio.sleep(1.0)  # Nominatim rate-limit
        await db.commit()
        print(f"Tugadi: {fixed}/{len(rows)} filial koordinatasi to'ldirildi.")


async def show_evos() -> None:
    """Diagnostika: 'evos' nomli merchant filiallarini ko'rsatadi."""
    async with AsyncSessionLocal() as db:
        merchants = (await db.execute(
            select(Merchant).where(Merchant.business_name.ilike("%evos%"))
        )).scalars().all()
        for m in merchants:
            branches = (await db.execute(
                select(MerchantBranch).where(MerchantBranch.merchant_id == m.id)
            )).scalars().all()
            print(f"Merchant #{m.id} {m.business_name!r} active={m.is_active} "
                  f"branches={len(branches)}")
            for b in branches:
                print(f"   branch #{b.id} {b.name!r} active={b.is_active} "
                      f"lat={b.lat} lng={b.lng} addr={b.address!r}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--merchant", type=int, default=None, help="Faqat shu merchant_id")
    p.add_argument("--show-evos", action="store_true", help="Evos filiallarini diagnostika qilish")
    args = p.parse_args()
    if args.show_evos:
        asyncio.run(show_evos())
    else:
        asyncio.run(run(args.merchant))
