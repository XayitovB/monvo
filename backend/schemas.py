from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from enum import Enum


# ─── AUTH (Customers — phone OTP) ───────────────────────────────────────────

class PhoneOTPRequest(BaseModel):
    phone: str = Field(..., example="+998901234567", description="Telefon raqam (+998...)")


class PhoneVerifyRequest(BaseModel):
    phone: str = Field(..., example="+998901234567")
    code: str = Field(..., min_length=6, max_length=6, example="123456")
    name: Optional[str] = Field(None, max_length=100, description="Yangi foydalanuvchi uchun ism")
    # Qurilma ma'lumotlari (auth tarixiga yozish uchun)
    platform: Optional[str] = None      # ios | android | web
    os_version: Optional[str] = None    # 17.5
    app_version: Optional[str] = None   # 2.1.0+3
    device_model: Optional[str] = None  # iPhone 14 Pro
    device_uid: Optional[str] = None    # vendor UUID


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    name: str
    is_new: bool = False
    role: str = "user"
    # When the same phone is also registered as merchant_staff (cashier),
    # we return a second JWT scoped to that staff record so the app can
    # route directly into the cashier UI without a second auth round-trip.
    staff_token: Optional[str] = None
    staff_id: Optional[int] = None
    merchant_id: Optional[int] = None
    staff_role: Optional[str] = None
    staff_full_name: Optional[str] = None


# Legacy (admin panel uchun saqlanadi)
class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: Optional[str] = Field(None)
    password: str = Field(..., min_length=8, max_length=100)


class GoogleAuthRequest(BaseModel):
    id_token: str


class UserOut(BaseModel):
    id: int
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    language: Optional[str] = "uz"
    role: Optional[str] = "user"
    birth_date: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class UserProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    email: Optional[str] = None
    language: Optional[str] = None
    birth_date: Optional[datetime] = None


# ─── MERCHANTS (Businesses) ──────────────────────────────────────────────────

class MerchantRegister(BaseModel):
    business_name: str = Field(..., min_length=2, max_length=150, example="Cafe Nur")
    email: EmailStr = Field(..., example="owner@cafenur.uz")
    password: str = Field(..., min_length=8, max_length=100)
    phone: Optional[str] = Field("", max_length=30)
    description: Optional[str] = Field("", max_length=1000)


class MerchantLogin(BaseModel):
    email: EmailStr
    password: str


class MerchantTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    merchant_id: int
    business_name: str


class MerchantOut(BaseModel):
    id: int
    business_name: str
    email: str
    phone: str
    description: str
    logo_url: str
    brand_color: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class MerchantUpdate(BaseModel):
    business_name: Optional[str] = None
    phone: Optional[str] = None
    description: Optional[str] = None
    logo_url: Optional[str] = None
    brand_color: Optional[str] = None
    # Loyalty modeli
    loyalty_type: Optional[str] = None        # "cashback" | "stamp"
    stamp_threshold: Optional[int] = Field(None, ge=2, le=50)
    stamp_reward_title: Optional[str] = Field(None, max_length=120)


# ─── CARDS (QR loyalty cards) ────────────────────────────────────────────────

class CardTier(str, Enum):
    bronze = "bronze"
    silver = "silver"
    gold = "gold"
    platinum = "platinum"


class CardCreate(BaseModel):
    holder_name: str = Field("", max_length=150, example="Aziz Karimov")
    holder_phone: str = Field("", max_length=30, example="+998901234567")
    holder_birth_date: Optional[datetime] = Field(None, description="Tug'ilgan sana (birthday bonusi uchun)")
    user_id: Optional[int] = Field(None, description="Mavjud foydalanuvchiga bog'lash")


class CardUpdate(BaseModel):
    holder_name: Optional[str] = Field(None, max_length=150)
    holder_phone: Optional[str] = Field(None, max_length=30)
    holder_birth_date: Optional[datetime] = None


class CardOut(BaseModel):
    id: int
    merchant_id: int
    user_id: Optional[int]
    card_uid: str
    holder_name: str
    holder_phone: str
    holder_birth_date: Optional[datetime] = None
    points: int
    tier: str
    is_active: bool
    issued_at: datetime
    last_used_at: Optional[datetime]

    class Config:
        from_attributes = True


class CardQR(BaseModel):
    card_uid: str
    qr_payload: str = Field(..., description="QR koda yoziladigan string (monvo://card/<uid>)")


# ─── REWARDS ─────────────────────────────────────────────────────────────────

class RewardCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200, example="Bepul kofe")
    description: Optional[str] = Field("", max_length=1000)
    points_cost: int = Field(..., gt=0, example=100)
    image_url: Optional[str] = Field("", max_length=500)
    stock: int = Field(-1, description="-1 = cheksiz")
    # Reward konstruktor maydonlari
    category: Optional[str] = Field("general", max_length=30)
    min_tier: Optional[str] = Field("bronze", max_length=20)
    icon: Optional[str] = Field("gift", max_length=30)
    color: Optional[str] = Field("#7C3AED", max_length=10)
    terms: Optional[str] = Field("", max_length=2000)
    max_per_user: Optional[int] = Field(-1)
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    sort_order: Optional[int] = Field(100)


class RewardUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    points_cost: Optional[int] = None
    image_url: Optional[str] = None
    stock: Optional[int] = None
    is_active: Optional[bool] = None
    category: Optional[str] = None
    min_tier: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    terms: Optional[str] = None
    max_per_user: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    sort_order: Optional[int] = None


class RewardOut(BaseModel):
    id: int
    merchant_id: int
    title: str
    description: str
    points_cost: int
    image_url: str
    stock: int
    is_active: bool
    category: Optional[str] = "general"
    min_tier: Optional[str] = "bronze"
    icon: Optional[str] = "gift"
    color: Optional[str] = "#7C3AED"
    terms: Optional[str] = ""
    max_per_user: Optional[int] = -1
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    sort_order: Optional[int] = 100
    created_at: datetime

    class Config:
        from_attributes = True


# ─── POINT RULES ─────────────────────────────────────────────────────────────

class PointRuleCreate(BaseModel):
    name: str = Field("Default rule", max_length=150)
    rule_type: str = Field("per_amount", description="per_amount | per_visit")
    amount_per_point: float = Field(1000, ge=0)
    points_per_visit: int = Field(1, ge=0)


class PointRuleOut(BaseModel):
    id: int
    merchant_id: int
    name: str
    rule_type: str
    amount_per_point: float
    points_per_visit: int
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


# ─── TRANSACTIONS (Earn / Redeem) ────────────────────────────────────────────

class ScanRequest(BaseModel):
    """Merchant QR kartani skanlagandan keyin yuboradi."""
    card_uid: str = Field(..., example="a1b2c3d4-...")
    amount: Optional[float] = Field(None, ge=0, example=45000, description="Xarid summasi (earn)")
    rule_id: Optional[int] = Field(None, description="Qaysi qoida bilan hisoblanadi")
    note: Optional[str] = Field("", max_length=300)


class RedeemRequest(BaseModel):
    card_uid: str
    reward_id: int


class TransactionOut(BaseModel):
    id: int
    card_id: int
    merchant_id: int
    reward_id: Optional[int]
    tx_type: str
    points_delta: int
    amount: float
    note: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── FCM / PUSH ──────────────────────────────────────────────────────────────

class FCMTokenRegister(BaseModel):
    token: str
    platform: str = "android"


class PushSendRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    body: str = Field(..., min_length=1, max_length=500)
    user_id: Optional[int] = None
    user_phone: Optional[str] = None  # "Yagona" — telefon raqam orqali (user_id o'rniga)
    data: Optional[dict] = None
    # Audience targeting (all optional — if all None and no user_id → broadcast to all)
    audience: Optional[str] = None  # "all" | "users" | "merchants" | "user_id"
    role: Optional[str] = None  # "user" | "merchant" | "admin" (when audience=users)
    tariff_status: Optional[str] = None  # "paid" | "unpaid" | "expired" (merchants)
    tariff_id: Optional[int] = None  # specific tariff plan filter
    # Professional push: kategoriya, rasm, bosilganda yo'naltirish
    category: Optional[str] = "info"   # info | promo | bonus | reminder | warning
    image_url: Optional[str] = ""      # rich push rasmi (URL)
    route: Optional[str] = ""          # card | promotions | profile | url
    route_id: Optional[str] = ""       # card id yoki URL


class PushNotificationLogOut(BaseModel):
    id: int
    title: str
    body: str
    target: str
    sent_count: int
    failed_count: int
    sent_at: datetime
    sent_by: str

    class Config:
        from_attributes = True


# ─── GAMIFICATION ────────────────────────────────────────────────────────────

class UserStatsOut(BaseModel):
    user_id: int
    xp: int
    level: int
    xp_to_next_level: int
    progress_percent: int
    total_scans: int
    total_redeems: int
    total_spent: float
    unique_merchants: int
    streak_days: int
    longest_streak: int
    last_activity_date: Optional[datetime] = None


class AchievementOut(BaseModel):
    id: int
    code: str
    title: str
    description: str
    title_ru: Optional[str] = ""
    description_ru: Optional[str] = ""
    icon: str
    color: str
    category: str
    criteria_type: str
    criteria_threshold: int
    xp_reward: int
    sort_order: int

    class Config:
        from_attributes = True


class AchievementWithStatus(AchievementOut):
    is_earned: bool = False
    earned_at: Optional[datetime] = None
    progress_current: int = 0  # foydalanuvchining hozirgi qiymati (criteria bo'yicha)


class AchievementCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=50)
    title: str = Field(..., min_length=2, max_length=150)
    description: Optional[str] = ""
    title_ru: Optional[str] = ""
    description_ru: Optional[str] = ""
    icon: Optional[str] = "trophy"
    color: Optional[str] = "#F59E0B"
    category: Optional[str] = "general"
    criteria_type: str = Field(..., description="total_scans|unique_merchants|total_spent|total_redeems|streak_days|level_reached")
    criteria_threshold: int = Field(..., ge=1)
    xp_reward: int = Field(100, ge=0)
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 100


class AchievementUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    title_ru: Optional[str] = None
    description_ru: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    category: Optional[str] = None
    criteria_threshold: Optional[int] = None
    xp_reward: Optional[int] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class ContestOut(BaseModel):
    id: int
    title: str
    description: str
    title_ru: Optional[str] = ""
    description_ru: Optional[str] = ""
    icon: str
    banner_url: str
    contest_type: str
    merchant_id: Optional[int] = None
    status: str
    starts_at: datetime
    ends_at: datetime
    prize_description: str
    prize_description_ru: Optional[str] = ""
    prize_xp: int
    max_winners: int
    auto_join: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ContestWithMyRank(ContestOut):
    my_rank: Optional[int] = None
    my_score: int = 0
    is_joined: bool = False
    participants_count: int = 0


class ContestCreate(BaseModel):
    title: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = ""
    title_ru: Optional[str] = ""
    description_ru: Optional[str] = ""
    icon: Optional[str] = "trophy"
    banner_url: Optional[str] = ""
    contest_type: str = Field(..., description="top_scanner|top_spender|top_streak|top_xp")
    merchant_id: Optional[int] = None
    status: Optional[str] = "draft"
    starts_at: datetime
    ends_at: datetime
    prize_description: Optional[str] = ""
    prize_description_ru: Optional[str] = ""
    prize_xp: int = Field(1000, ge=0)
    max_winners: int = Field(10, ge=1)
    auto_join: bool = True


class ContestUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    title_ru: Optional[str] = None
    description_ru: Optional[str] = None
    icon: Optional[str] = None
    banner_url: Optional[str] = None
    status: Optional[str] = None
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    prize_description: Optional[str] = None
    prize_description_ru: Optional[str] = None
    prize_xp: Optional[int] = None
    max_winners: Optional[int] = None
    auto_join: Optional[bool] = None


class LeaderboardEntry(BaseModel):
    rank: int
    user_id: int
    user_name: str
    score: int  # XP for global, contest score for contests
    level: Optional[int] = None
    badge_count: Optional[int] = None
    is_me: bool = False


class LeaderboardOut(BaseModel):
    entries: list[LeaderboardEntry]
    my_rank: Optional[int] = None
    my_score: Optional[int] = None
    total_users: int = 0


# ─── MINI GAMES ──────────────────────────────────────────────────────────────

class GameStartRequest(BaseModel):
    game_type: str = Field(..., description="clicker | 2048")


class GameStartResponse(BaseModel):
    session_token: str
    started_at: datetime
    daily_attempts_remaining: int


class GameFinishRequest(BaseModel):
    session_token: str
    score: int = Field(..., ge=0)
    duration_seconds: Optional[int] = None  # client-reported, not trusted


class GameFinishResponse(BaseModel):
    accepted: bool
    score: int
    xp_earned: int
    new_total_xp: int
    new_level: int
    new_achievements: list[dict] = []
    contest_score: Optional[int] = None  # if joined a top_xp contest


class SpinPrizeOut(BaseModel):
    id: int
    label: str
    label_ru: Optional[str] = ""
    xp: int
    weight: int
    color: str
    icon: str
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True


class SpinPrizeCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=100)
    label_ru: Optional[str] = ""
    xp: int = Field(..., ge=0)
    weight: int = Field(10, ge=1, le=1000)
    color: Optional[str] = "#7C3AED"
    icon: Optional[str] = "gift"
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 100


class SpinPrizeUpdate(BaseModel):
    label: Optional[str] = None
    label_ru: Optional[str] = None
    xp: Optional[int] = None
    weight: Optional[int] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class SpinStatusResponse(BaseModel):
    can_spin: bool
    next_available_at: Optional[datetime] = None
    seconds_until_next: int = 0
    prizes: list[SpinPrizeOut]


class SpinResultResponse(BaseModel):
    prize_id: int
    label: str
    xp_won: int
    new_total_xp: int
    new_level: int
    new_achievements: list[dict] = []
    next_available_at: datetime
