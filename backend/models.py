from sqlalchemy import Column, Integer, String, Numeric, DateTime, ForeignKey, Text, Boolean, UniqueConstraint, Index, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base
from core.crypto import EncryptedJSON


def _now():
    return datetime.now(timezone.utc)


# ── Users (Customers — oddiy foydalanuvchilar, kartalarni ishlatadi) ─────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=True)
    email = Column(String(100), unique=True, nullable=True)
    password_hash = Column(String(255), nullable=False, default="")
    google_id = Column(String(100), unique=True, nullable=True)
    telegram_id = Column(String(50), unique=True, nullable=True)
    auth_provider = Column(String(20), default="phone")  # "phone" | "email" | "google" | "telegram"
    role = Column(String(20), default="user")  # "user" | "merchant" | "admin"
    merchant_account_id = Column(Integer, ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True)
    language = Column(String(5), default="uz")  # "uz" | "ru"
    birth_date = Column(DateTime(timezone=True), nullable=True)  # Birthday bonus uchun
    created_at = Column(DateTime(timezone=True), default=_now)
    is_active = Column(Boolean, default=True)
    # Geo-region (Toshkent, Samarqand, Navoiy…) — ilova joylashuvidan aniqlanadi.
    region = Column(String(40), default="", nullable=False, server_default="")
    region_updated_at = Column(DateTime(timezone=True), nullable=True)

    cards = relationship("Card", back_populates="user", cascade="all, delete")
    audit_logs = relationship("AuditLog", back_populates="user", cascade="all, delete")
    fcm_tokens = relationship("FCMToken", back_populates="user", cascade="all, delete")
    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete")


# ── Merchants (Biznes — karta chiqaradi, reward qoidalarini belgilaydi) ──────
class Merchant(Base):
    __tablename__ = "merchants"

    id = Column(Integer, primary_key=True)
    business_name = Column(String(150), nullable=False)
    business_type = Column(String(40), default="other", nullable=False)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    phone = Column(String(30), default="")
    description = Column(Text, default="")
    # Text (not VARCHAR(500)) so we can store inline data:image/png;base64,...
    # logos that easily exceed a few hundred bytes.
    logo_url = Column(Text, default="")
    brand_color = Column(String(10), default="#0B2545")
    card_design = Column(JSON, default=dict)  # Karta dizayn konstruktori JSON
    custom_tiers = Column(JSON, default=list)  # Tier konstruktori: [{name, min_points, color, emoji, benefits}]
    # Loyalty modeli: "cashback" (ball/cashback), "stamp" (N+1 shtamp karta),
    # "spend" (umumiy xarid chegarasiga yetganda sovg'a — progress karta)
    loyalty_type = Column(String(16), default="cashback", nullable=False, server_default="cashback")
    stamp_threshold = Column(Integer, default=7, nullable=False, server_default="7")  # N: nechta shtampdan keyin sovg'a
    stamp_reward_title = Column(String(120), default="Bepul mahsulot", nullable=False, server_default="Bepul mahsulot")
    stamp_icon = Column(String(24), default="coffee", nullable=False, server_default="coffee")  # punch-card ikonка nomi
    spend_goal = Column(Integer, default=1000000, nullable=False, server_default="1000000")  # 'spend' modeli: maqsad summa (so'm)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    # ── Tarif (subscription) ──────────────────────────────────────────────────
    tariff_id = Column(Integer, ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    tariff_started_at = Column(DateTime(timezone=True), nullable=True)
    tariff_expires_at = Column(DateTime(timezone=True), nullable=True)

    cards = relationship("Card", back_populates="merchant", cascade="all, delete")
    rewards = relationship("Reward", back_populates="merchant", cascade="all, delete")
    point_rules = relationship("PointRule", back_populates="merchant", cascade="all, delete")
    transactions = relationship("Transaction", back_populates="merchant", cascade="all, delete")

    __table_args__ = (Index("ix_merchant_email", "email"),)


# ── Tariffs (Tariflar — subscription rejalari) ───────────────────────────────
class Tariff(Base):
    __tablename__ = "tariffs"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), nullable=False, default="")          # masalan: starter | business | premium
    title_uz = Column(String(100), nullable=False, default="")     # ko'rsatish nomi (uz)
    title_ru = Column(String(100), nullable=False, default="")     # (ru)
    description_uz = Column(Text, default="")
    description_ru = Column(Text, default="")
    monthly_price = Column(Integer, nullable=False, default=0)     # UZS
    # null = oddiy oylik tarif; son = belgilangan kunlik (masalan demo = 14 kun)
    duration_days = Column(Integer, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    is_recommended = Column(Boolean, default=False, nullable=False)
    # Cheklovlar — null = cheksiz
    max_customers = Column(Integer, nullable=True)
    max_branches = Column(Integer, nullable=True)
    max_staff = Column(Integer, nullable=True)
    max_rewards = Column(Integer, nullable=True)
    max_push_per_month = Column(Integer, nullable=True)
    max_announcements = Column(Integer, nullable=True)
    # Funksiya bayroqlari
    has_tier = Column(Boolean, default=False, nullable=False)
    has_gamification = Column(Boolean, default=False, nullable=False)
    has_games = Column(Boolean, default=False, nullable=False)
    has_birthday_bonus = Column(Boolean, default=False, nullable=False)
    has_segments_advanced = Column(Boolean, default=False, nullable=False)
    has_card_design_custom = Column(Boolean, default=False, nullable=False)
    has_api_access = Column(Boolean, default=False, nullable=False)
    has_priority_support = Column(Boolean, default=False, nullable=False)
    has_scheduled_push = Column(Boolean, default=False, nullable=False)
    has_pos_integration = Column(Boolean, default=False, nullable=False)
    # Qo'shimcha xususiyatlar (kelajakda kengaytirish uchun)
    extra_features = Column(JSON, default=list)  # ["Custom branding", "24/7 support"]
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


# NOTE: legacy `Branch` and `Staff` models were removed — canonical tables
# are `merchant_branches` and `merchant_staff` (see MerchantBranch / MerchantStaff
# below).  Old `branches` / `staff` DB tables may still exist from earlier
# provisioning runs but are no longer read or written by the application.


# ── Cards (QR + points balans — merchant tomonidan chiqariladi) ──────────────
class Card(Base):
    __tablename__ = "cards"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    card_uid = Column(String(64), unique=True, nullable=False)  # QR uchun unikal ID (UUID)
    holder_name = Column(String(150), default="")
    holder_phone = Column(String(30), default="")
    holder_birth_date = Column(DateTime(timezone=True), nullable=True)  # Birthday bonus (card-darajasida)
    # CRM — merchant shu karta egasiga tegishli maxsus ma'lumotlar
    tags = Column(JSON, default=list)     # ["VIP", "Aperitif", ...]
    notes = Column(Text, default="")       # Erkin matn eslatma
    branch_id = Column(Integer, ForeignKey("merchant_branches.id", ondelete="SET NULL"), nullable=True)
    points = Column(Integer, default=0, nullable=False)
    stamp_count = Column(Integer, default=0, nullable=False, server_default="0")  # N+1 shtamp hisoblagichi
    spend_progress = Column(Integer, default=0, nullable=False, server_default="0")  # 'spend' modeli: joriy umumiy xarid (so'm)
    tier = Column(String(30), default="bronze")  # bronze | silver | gold | platinum
    is_active = Column(Boolean, default=True)
    issued_at = Column(DateTime(timezone=True), default=_now)
    last_used_at = Column(DateTime(timezone=True), nullable=True)

    merchant = relationship("Merchant", back_populates="cards")
    user = relationship("User", back_populates="cards")
    transactions = relationship("Transaction", back_populates="card", cascade="all, delete")

    __table_args__ = (
        Index("ix_card_merchant", "merchant_id"),
        Index("ix_card_user", "user_id"),
        Index("ix_card_uid", "card_uid"),
    )


# ── Rewards (Katalog: N ball = X mahsulot/chegirma) ──────────────────────────
class Reward(Base):
    __tablename__ = "rewards"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    title = Column(String(200), nullable=False)
    description = Column(Text, default="")
    points_cost = Column(Integer, nullable=False)
    image_url = Column(String(500), default="")
    stock = Column(Integer, default=-1)  # -1 = cheksiz
    is_active = Column(Boolean, default=True)
    # Reward konstruktor — qo'shimcha maydonlar
    category = Column(String(30), default="general")  # general|freebie|discount|experience|seasonal
    min_tier = Column(String(20), default="bronze")   # bronze|silver|gold|platinum
    icon = Column(String(30), default="gift")         # lucide ikon nomi
    color = Column(String(10), default="#7C3AED")     # brand rang
    terms = Column(Text, default="")                  # shartlar matni
    max_per_user = Column(Integer, default=-1)        # -1 = cheksiz
    valid_from = Column(DateTime(timezone=True), nullable=True)
    valid_until = Column(DateTime(timezone=True), nullable=True)
    sort_order = Column(Integer, default=100)         # katalogda tartib
    created_at = Column(DateTime(timezone=True), default=_now)

    merchant = relationship("Merchant", back_populates="rewards")

    __table_args__ = (
        Index("ix_reward_merchant", "merchant_id"),
        Index("ix_reward_category", "category"),
    )


# ── Point Rules (Har X so'm = Y ball; yoki tashrif uchun belgilangan ball) ───
class PointRule(Base):
    __tablename__ = "point_rules"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), default="Default rule")
    rule_type = Column(String(30), default="per_amount")  # per_amount | per_visit
    amount_per_point = Column(Numeric(12, 2), default=1000)  # Har 1000 so'm = 1 ball
    points_per_visit = Column(Integer, default=1)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    merchant = relationship("Merchant", back_populates="point_rules")

    __table_args__ = (Index("ix_rule_merchant", "merchant_id"),)


# ── Transactions (earn / redeem — karta tarixi) ──────────────────────────────
class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    reward_id = Column(Integer, ForeignKey("rewards.id", ondelete="SET NULL"), nullable=True)
    tx_type = Column(String(20), nullable=False)  # earn | redeem | refund
    points_delta = Column(Integer, nullable=False)  # + for earn, - for redeem
    amount = Column(Numeric(12, 2), default=0)      # earn: xarid summasi; redeem: 0
    note = Column(String(300), default="")
    branch_id = Column(Integer, ForeignKey("merchant_branches.id", ondelete="SET NULL"), nullable=True)
    staff_id = Column(Integer, ForeignKey("merchant_staff.id", ondelete="SET NULL"), nullable=True)
    applied_rules = Column(JSON, default=list)  # Engine qaysi qoidalarni qo'llaganligi (ROI tracking)
    # POS integratsiya: webhook orqali kelgan tranzaksiyalar uchun idempotency.
    # (provider, external_ref) bo'yicha unique — bir cheki ikki marta bermaymiz.
    provider = Column(String(40), nullable=True)         # billz | iiko | poster | ...
    external_ref = Column(String(120), nullable=True)    # POS chek ID
    created_at = Column(DateTime(timezone=True), default=_now)

    card = relationship("Card", back_populates="transactions")
    merchant = relationship("Merchant", back_populates="transactions")
    reward = relationship("Reward")

    __table_args__ = (
        Index("ix_tx_card_created", "card_id", "created_at"),
        Index("ix_tx_merchant_created", "merchant_id", "created_at"),
        UniqueConstraint("provider", "external_ref", name="uq_tx_provider_external"),
    )


# ── Audit, Push, Reset, Templates, Links, Traffic, Waitlist (saqlaymiz) ──────
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True)
    # Nullable because admin/system actions aren't tied to a concrete user row.
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    actor = Column(String(100), default="")  # "user:123" | "admin:root" | "system"
    action = Column(Text, nullable=False)
    # Qo'shimcha ma'lumotlar (IP, qurilma, geo, va h.k.)
    ip = Column(String(45), default="")            # IPv4 yoki IPv6
    user_agent = Column(String(500), default="")   # HTTP user-agent
    platform = Column(String(20), default="")     # ios | android | web
    os_version = Column(String(40), default="")
    app_version = Column(String(40), default="")
    device_model = Column(String(100), default="")
    device_uid = Column(String(80), default="")    # vendor UUID
    extra = Column(JSON, default=dict)             # geo, va kelajakdagi maydonlar
    timestamp = Column(DateTime(timezone=True), default=_now)

    user = relationship("User", back_populates="audit_logs")

    __table_args__ = (
        Index("ix_audit_user_time", "user_id", "timestamp"),
        Index("ix_audit_timestamp", "timestamp"),
    )


class FCMToken(Base):
    __tablename__ = "fcm_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(512), nullable=False)
    platform = Column(String(20), default="android")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_user_fcm_token"),)

    user = relationship("User", back_populates="fcm_tokens")


class PushNotificationLog(Base):
    __tablename__ = "push_notification_logs"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    target = Column(String(50), default="all")
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    sent_at = Column(DateTime(timezone=True), default=_now)
    sent_by = Column(String(100), default="admin")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    code = Column(String(6), nullable=False)
    token = Column(String(64), nullable=False, unique=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    user = relationship("User", back_populates="reset_tokens")

    __table_args__ = (
        Index("ix_reset_token_user", "user_id"),
        Index("ix_reset_token_token", "token"),
    )


class EmailTemplate(Base):
    __tablename__ = "email_templates"

    id = Column(Integer, primary_key=True)
    key = Column(String(50), unique=True, nullable=False)
    subject = Column(String(200), nullable=False)
    body_html = Column(Text, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    updated_by = Column(String(100))


class AppLinks(Base):
    __tablename__ = "app_links"

    id = Column(Integer, primary_key=True)
    android_url = Column(String(500), default="")
    ios_url = Column(String(500), default="")
    telegram_url = Column(String(500), default="")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    updated_by = Column(String(100))


class PageView(Base):
    __tablename__ = "page_views"

    id = Column(Integer, primary_key=True)
    path = Column(String(200), default="/")
    ip_hash = Column(String(64))
    country = Column(String(4))
    referrer = Column(String(500))
    user_agent = Column(String(300))
    timestamp = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_pv_timestamp", "timestamp"),
        Index("ix_pv_path", "path"),
    )


class Waitlist(Base):
    __tablename__ = "waitlist"

    id = Column(Integer, primary_key=True)
    email = Column(String(200), unique=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_waitlist_email", "email"),)


class AppSettings(Base):
    """Singleton — faqat bitta qator bo'ladi (id=1)."""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True)
    app_name = Column(String(100), default="Monvo")
    logo_url = Column(Text, default="")
    primary_color = Column(String(10), default="#0B2545")
    gamification_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    telegram_bot_token = Column(String(200), default="", nullable=False, server_default="")
    telegram_chat_id = Column(String(100), default="", nullable=False, server_default="")
    telegram_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    payme_merchant_id  = Column(String(100), default="", nullable=False, server_default="")
    payme_key          = Column(String(200), default="", nullable=False, server_default="")
    payme_test_key     = Column(String(200), default="", nullable=False, server_default="")
    payme_test_mode    = Column(Boolean, default=False, nullable=False, server_default="false")
    payme_checkout_url = Column(String(200), default="https://checkout.paycom.uz", nullable=False, server_default="https://checkout.paycom.uz")
    # Ilova yangilanish modali (admin boshqaradi). latest = store'dagi eng so'nggi
    # build; qurilma undan past bo'lsa "yangilang" chiqadi. min = majburiy chegara.
    update_latest_build_ios = Column(Integer, default=0, nullable=False, server_default="0")
    update_min_build_ios = Column(Integer, default=0, nullable=False, server_default="0")
    update_latest_build_android = Column(Integer, default=0, nullable=False, server_default="0")
    update_min_build_android = Column(Integer, default=0, nullable=False, server_default="0")
    # Merchant ilova (Monvo Business) update build raqamlari.
    merchant_update_latest_build_ios = Column(Integer, default=0, nullable=False, server_default="0")
    merchant_update_min_build_ios = Column(Integer, default=0, nullable=False, server_default="0")
    merchant_update_latest_build_android = Column(Integer, default=0, nullable=False, server_default="0")
    merchant_update_min_build_android = Column(Integer, default=0, nullable=False, server_default="0")
    # POS integration master switches — admin enables a provider globally
    # before any merchant can connect their account. Disabled providers
    # show up as "Tez orada" on the merchant side.
    # Production-tayyor provayderlar (Billz va iiko backend bilan to'liq integratsiyalangan)
    # default=True qilib qo'yildi, shu bilan merchant'lar darhol ulay oladi.
    pos_billz_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    pos_iiko_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    pos_yclients_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    pos_rkeeper_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    pos_onec_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    pos_poster_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    pos_moysklad_enabled = Column(Boolean, default=False, nullable=False, server_default="false")
    pos_alipos_enabled = Column(Boolean, default=True, nullable=False, server_default="true")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)
    updated_by = Column(String(100), default="admin")


class PosIntegration(Base):
    """Per-merchant POS connection.

    A row exists once a merchant connected an external POS (Billz, iiko, ...).
    Credentials are stored as JSON so each provider can shape its own keys
    (Billz: api_login + api_secret + shop_id; iiko: apiLogin + organization_id).
    """
    __tablename__ = "pos_integrations"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(40), nullable=False)  # "billz" | "iiko" | ...
    # Maxfiy ma'lumotlar (login/parol/secret) — bazada shifrlangan saqlanadi
    # (ENCRYPTION_KEY o'rnatilgan bo'lsa). Kalit yo'q bo'lsa oddiy JSON kabi.
    credentials = Column(EncryptedJSON, default=dict, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    last_sync_at = Column(DateTime(timezone=True), nullable=True)
    last_error = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("merchant_id", "provider", name="uq_pos_merchant_provider"),
        Index("ix_pos_integrations_merchant", "merchant_id"),
        Index("ix_pos_integrations_provider", "provider"),
    )


class DemoLead(Base):
    """Landing demo formasidan kelgan zayafkalar."""
    __tablename__ = "demo_leads"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), default="")
    phone = Column(String(40), default="")
    business_name = Column(String(200), default="")
    business_type = Column(String(80), default="")
    source = Column(String(80), default="landing-demo-form")
    telegram_sent = Column(Boolean, default=False, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_demo_leads_created", "created_at"),)


class UserNotification(Base):
    __tablename__ = "user_notifications"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)  # null = broadcast
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    icon = Column(String(50), default="notifications")  # Material icon name
    # Kategoriya: info | promo | bonus | reminder | warning — ilovada ikonka+rang.
    category = Column(String(20), default="info", nullable=False, server_default="info")
    image_url = Column(Text, default="", nullable=False, server_default="")  # rich push rasmi
    route = Column(String(40), default="", nullable=False, server_default="")  # bosilganda: card|promotions|profile|url
    route_id = Column(String(120), default="", nullable=False, server_default="")  # masalan card id yoki URL
    campaign_id = Column(Integer, nullable=True)  # PushNotificationLog.id — o'qilgan statistikasi uchun
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_notif_user_created", "user_id", "created_at"),
    )


class MerchantInboxMessage(Base):
    """Admin → merchant xabarlari (bildirishnomalar inbox)."""
    __tablename__ = "merchant_inbox_messages"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=True)  # null = broadcast
    title = Column(String(200), nullable=False)
    body = Column(Text, nullable=False)
    icon = Column(String(50), default="notifications")
    tone = Column(String(20), default="neutral")  # neutral / good / warn / bad / brand
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_minbox_merchant_created", "merchant_id", "created_at"),
    )


class PhoneOTP(Base):
    __tablename__ = "phone_otps"

    id = Column(Integer, primary_key=True)
    phone = Column(String(20), nullable=False)
    code = Column(String(6), nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_phone_otp_phone", "phone"),)


# ── Merchant Branches (filiallar) ────────────────────────────────────────────
class MerchantBranch(Base):
    __tablename__ = "merchant_branches"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    address = Column(String(500), default="")
    phone = Column(String(30), default="")
    lat = Column(Numeric(10, 6), nullable=True)
    lng = Column(Numeric(10, 6), nullable=True)
    working_hours = Column(String(100), default="")
    # Gallery — list of data:image/... or http(s) URLs. Shown on the
    # discover-map place card so customers can see what the branch
    # looks like before visiting.
    photos = Column(JSON, default=list)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_merchant_branches_merchant", "merchant_id"),)


# ── Merchant Staff (kassirlar) ───────────────────────────────────────────────
class MerchantStaff(Base):
    __tablename__ = "merchant_staff"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    branch_id = Column(Integer, ForeignKey("merchant_branches.id", ondelete="SET NULL"), nullable=True)
    username = Column(String(50), nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), default="")
    phone = Column(String(30), default="")
    role = Column(String(30), default="cashier")  # cashier | manager | admin
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("merchant_id", "username", name="uq_merchant_staff_merchant_username"),
        Index("ix_merchant_staff_merchant", "merchant_id"),
    )


# ── Merchant Campaigns (muddatli aksiyalar) ──────────────────────────────────
class MerchantCampaign(Base):
    __tablename__ = "merchant_campaigns"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(200), nullable=False)
    description = Column(Text, default="")
    campaign_type = Column(String(30), default="boost")
    # boost: loyalty qoidalarga ×N multiplier
    # flash: ma'lum reward chegirmasi
    # segment: ma'lum tier/RFM segmentga maxsus oferta
    config = Column(JSON, default=dict)
    target_segment = Column(String(50), default="all")  # all | tier:silver | rfm:champions ...
    status = Column(String(20), default="draft")  # draft | active | paused | finished
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    created_by = Column(String(100), default="")

    __table_args__ = (
        Index("ix_campaign_merchant_status", "merchant_id", "status"),
    )


# ── Merchant Notification Templates ──────────────────────────────────────────
class MerchantNotificationTemplate(Base):
    __tablename__ = "merchant_notification_templates"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(150), nullable=False)
    channel = Column(String(20), default="push")  # push | sms | email
    title = Column(String(200), default="")
    body = Column(Text, default="")
    target_segment = Column(String(50), default="all")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (Index("ix_tmpl_merchant", "merchant_id"),)


class MerchantNotificationLog(Base):
    __tablename__ = "merchant_notification_logs"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    template_id = Column(Integer, ForeignKey("merchant_notification_templates.id", ondelete="SET NULL"), nullable=True)
    channel = Column(String(20), default="push")
    title = Column(String(200), default="")
    body = Column(Text, default="")
    target = Column(String(100), default="all")
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    sent_at = Column(DateTime(timezone=True), default=_now)


# ── Merchant Reviews (mijoz izohlari) ────────────────────────────────────────
class MerchantReview(Base):
    __tablename__ = "merchant_reviews"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    rating = Column(Integer, default=5)  # 1-5
    comment = Column(Text, default="")
    is_published = Column(Boolean, default=True)
    reply = Column(Text, default="")  # merchant javobi
    replied_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_review_merchant_created", "merchant_id", "created_at"),
        Index("ix_review_rating", "rating"),
    )


# ── Announcements (platform-wide banner) ─────────────────────────────────────
class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    body = Column(Text, default="")
    type = Column(String(20), default="info")        # info | warning | critical | success
    target = Column(String(30), default="all")       # all | users | merchants | admin | landing
    cta_label = Column(String(80), default="")
    cta_url = Column(String(500), default="")
    is_active = Column(Boolean, default=True)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    ends_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    created_by = Column(String(100), default="admin")

    __table_args__ = (
        Index("ix_ann_active_target", "is_active", "target"),
    )


# ── Billing / Subscription ───────────────────────────────────────────────────
class BillingPlan(Base):
    __tablename__ = "billing_plans"

    id = Column(Integer, primary_key=True)
    key = Column(String(30), unique=True, nullable=False)  # free | pro | enterprise
    name = Column(String(100), nullable=False)
    description = Column(Text, default="")
    price_monthly = Column(Numeric(10, 2), default=0)
    price_yearly = Column(Numeric(10, 2), default=0)
    max_cards = Column(Integer, default=-1)      # -1 = unlimited
    max_rewards = Column(Integer, default=-1)
    max_branches = Column(Integer, default=1)
    features = Column(JSON, default=dict)        # {push: true, sms: false, analytics: true, ...}
    sort_order = Column(Integer, default=100)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)


class MerchantSubscription(Base):
    __tablename__ = "merchant_subscriptions"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan_id = Column(Integer, ForeignKey("billing_plans.id", ondelete="SET NULL"), nullable=True)
    # Yagona manba — obuna qaysi Tariff (funksiya bayroqlari)ni beradi.
    # merchant.tariff_id bilan sinxron saqlanadi (read/write yo'llarida).
    tariff_id = Column(Integer, ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    status = Column(String(20), default="active")  # active | paused | cancelled | trial
    started_at = Column(DateTime(timezone=True), default=_now)
    renewed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (Index("ix_sub_merchant", "merchant_id"),)


class Invoice(Base):
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    plan_id = Column(Integer, ForeignKey("billing_plans.id", ondelete="SET NULL"), nullable=True)
    # Tariff (yagona manba) — Payme to'lovi qaysi tarifga ekanini eslab qoladi
    tariff_id = Column(Integer, ForeignKey("tariffs.id", ondelete="SET NULL"), nullable=True)
    invoice_number = Column(String(50), default="")
    amount = Column(Numeric(12, 2), default=0)
    currency = Column(String(5), default="UZS")
    status = Column(String(20), default="pending")  # pending | paid | failed | refunded | void
    period_start = Column(DateTime(timezone=True), nullable=True)
    period_end = Column(DateTime(timezone=True), nullable=True)
    paid_at = Column(DateTime(timezone=True), nullable=True)
    note = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_inv_merchant_status", "merchant_id", "status"),
        Index("ix_inv_created", "created_at"),
    )


# ── Admin Users (multi-admin + roles) ────────────────────────────────────────
class AdminUser(Base):
    __tablename__ = "admin_users"

    id = Column(Integer, primary_key=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(100), default="")
    email = Column(String(100), default="")
    role = Column(String(30), default="support")  # super_admin | support | analyst | marketing
    is_active = Column(Boolean, default=True)
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    created_by = Column(String(100), default="admin")

    __table_args__ = (Index("ix_adminuser_active", "is_active"),)


# ── Loyalty Constructor (merchant o'zi tanlaydigan qoidalar) ─────────────────
class LoyaltyRule(Base):
    """
    Merchant tomonidan sozlanadigan bonus qoidasi.

    rule_type turlari:
      - classic_points    : {amount_per_point: 1000}
      - per_visit         : {points_per_visit: 1}
      - cashback_percent  : {percent: 5}
      - tier_cashback     : {tiers: {bronze: 2, silver: 4, gold: 6, platinum: 8}}
      - punch_card        : {threshold: 10, reward_points: 500, reward_title: "Free coffee"}
      - spend_threshold   : {threshold_amount: 500000, period_days: 30, reward_points: 2000}
      - happy_hour        : {multiplier: 2, days: [0,6], start_hour: 15, end_hour: 17}
      - first_visit       : {bonus_points: 500}
      - referral          : {referrer_points: 1000, referee_points: 500}
    """
    __tablename__ = "loyalty_rules"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    rule_type = Column(String(40), nullable=False)
    name = Column(String(150), default="")
    description = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    priority = Column(Integer, default=100)  # past qiymat → birinchi qo'llaniladi
    config = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_loyalty_merchant", "merchant_id"),
        Index("ix_loyalty_merchant_active", "merchant_id", "is_active"),
    )


class LoyaltyProgress(Base):
    """Punch-card va spend-threshold kabi qoidalarning har karta bo'yicha progressi."""
    __tablename__ = "loyalty_progress"

    id = Column(Integer, primary_key=True)
    rule_id = Column(Integer, ForeignKey("loyalty_rules.id", ondelete="CASCADE"), nullable=False)
    card_id = Column(Integer, ForeignKey("cards.id", ondelete="CASCADE"), nullable=False)
    progress_count = Column(Integer, default=0)         # punch_card uchun: tashriflar soni
    progress_amount = Column(Numeric(14, 2), default=0)  # spend_threshold uchun: jami summa
    period_start = Column(DateTime(timezone=True), default=_now)
    last_reward_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("rule_id", "card_id", name="uq_progress_rule_card"),
        Index("ix_progress_card", "card_id"),
    )


# ── A/B Testing ──────────────────────────────────────────────────────────────
class Experiment(Base):
    """Marketing/UX eksperimenti — ikki yoki undan ortiq variant orasida sinov."""
    __tablename__ = "experiments"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, default="")
    hypothesis = Column(Text, default="")
    primary_metric = Column(String(50), default="conversion")  # conversion | revenue | retention
    status = Column(String(20), default="draft")  # draft | running | paused | finished
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    created_by = Column(String(100), default="admin")

    variants = relationship("ExperimentVariant", back_populates="experiment", cascade="all, delete")
    events = relationship("ExperimentEvent", back_populates="experiment", cascade="all, delete")

    __table_args__ = (
        Index("ix_exp_status", "status"),
        Index("ix_exp_merchant", "merchant_id"),
    )


class ExperimentVariant(Base):
    """Eksperiment varianti (Control, A, B, ...)."""
    __tablename__ = "experiment_variants"

    id = Column(Integer, primary_key=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(80), nullable=False)
    description = Column(Text, default="")
    is_control = Column(Boolean, default=False)
    weight = Column(Integer, default=50)  # 0-100, summasi 100 bo'lishi kerak

    experiment = relationship("Experiment", back_populates="variants")

    __table_args__ = (
        Index("ix_var_exp", "experiment_id"),
        UniqueConstraint("experiment_id", "name", name="uq_exp_variant_name"),
    )


class ExperimentEvent(Base):
    """Eksperiment event'i — impression, conversion yoki revenue."""
    __tablename__ = "experiment_events"

    id = Column(Integer, primary_key=True)
    experiment_id = Column(Integer, ForeignKey("experiments.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("experiment_variants.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    event_type = Column(String(30), nullable=False)  # impression | conversion
    value = Column(Numeric(12, 2), default=0)  # revenue yoki boshqa raqamli qiymat
    created_at = Column(DateTime(timezone=True), default=_now)

    experiment = relationship("Experiment", back_populates="events")

    __table_args__ = (
        Index("ix_ev_exp_variant", "experiment_id", "variant_id"),
        Index("ix_ev_exp_type", "experiment_id", "event_type"),
    )


# ─── GAMIFICATION ─────────────────────────────────────────────────────────────
class UserStats(Base):
    """Foydalanuvchi gamification statistikasi — XP, level, streak."""
    __tablename__ = "user_stats"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    xp = Column(Integer, default=0, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    total_scans = Column(Integer, default=0, nullable=False)
    total_redeems = Column(Integer, default=0, nullable=False)
    total_spent = Column(Numeric(14, 2), default=0, nullable=False)
    unique_merchants = Column(Integer, default=0, nullable=False)
    streak_days = Column(Integer, default=0, nullable=False)
    longest_streak = Column(Integer, default=0, nullable=False)
    last_activity_date = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_user_stats_xp", "xp"),
        Index("ix_user_stats_level", "level"),
    )


class Achievement(Base):
    """Badge ta'rifi — admin tomonidan yaratiladi."""
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True)
    code = Column(String(50), unique=True, nullable=False)  # "first_scan", "loyal_10"
    title = Column(String(150), nullable=False)        # uz (default)
    description = Column(Text, default="")              # uz (default)
    title_ru = Column(String(150), default="")          # ru — bo'sh bo'lsa, title fallback
    description_ru = Column(Text, default="")           # ru — bo'sh bo'lsa, description fallback
    icon = Column(String(50), default="trophy")     # lucide icon
    color = Column(String(10), default="#F59E0B")
    category = Column(String(30), default="general")  # general | scanner | spender | streak | explorer | social
    criteria_type = Column(String(40), nullable=False)
    # criteria_type:
    #   total_scans       : {threshold: 1}
    #   unique_merchants  : {threshold: 5}
    #   total_spent       : {threshold: 100000}
    #   total_redeems     : {threshold: 5}
    #   streak_days       : {threshold: 7}
    #   level_reached     : {threshold: 5}
    criteria_threshold = Column(Integer, default=1, nullable=False)
    xp_reward = Column(Integer, default=100, nullable=False)
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_ach_active_category", "is_active", "category"),
    )


class UserAchievement(Base):
    """Qaysi user qaysi badge oldi."""
    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    achievement_id = Column(Integer, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False)
    earned_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
        Index("ix_user_ach_user", "user_id"),
    )


class Contest(Base):
    """Musobaqa — vaqt cheklangan reyting."""
    __tablename__ = "contests"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)         # uz (default)
    description = Column(Text, default="")               # uz (default)
    title_ru = Column(String(200), default="")           # ru — bo'sh bo'lsa, title fallback
    description_ru = Column(Text, default="")            # ru — bo'sh bo'lsa, description fallback
    icon = Column(String(50), default="trophy")
    banner_url = Column(String(500), default="")
    contest_type = Column(String(40), nullable=False)
    # contest_type:
    #   top_scanner  — eng ko'p scan qilgan (total_scans delta)
    #   top_spender  — eng ko'p sarflagan (total_spent delta)
    #   top_streak   — eng uzoq streak (streak_days)
    #   top_xp       — eng ko'p XP yiqqan (xp delta)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=True)  # null = global
    status = Column(String(20), default="draft")  # draft | active | finished | cancelled
    starts_at = Column(DateTime(timezone=True), nullable=False)
    ends_at = Column(DateTime(timezone=True), nullable=False)
    prize_description = Column(Text, default="")         # uz (default)
    prize_description_ru = Column(Text, default="")      # ru fallback
    prize_xp = Column(Integer, default=1000)
    max_winners = Column(Integer, default=10)
    auto_join = Column(Boolean, default=True)  # avtomatik qo'shilsinmi (true) yoki POST /join (false)
    created_at = Column(DateTime(timezone=True), default=_now)
    created_by = Column(String(100), default="admin")

    __table_args__ = (
        Index("ix_contest_status_dates", "status", "starts_at", "ends_at"),
        Index("ix_contest_merchant", "merchant_id"),
    )


class ContestParticipant(Base):
    """Musobaqada qatnashayotgan user va uning hozirgi ball."""
    __tablename__ = "contest_participants"

    id = Column(Integer, primary_key=True)
    contest_id = Column(Integer, ForeignKey("contests.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    score = Column(Integer, default=0, nullable=False)  # contest_type bo'yicha hisoblanadi
    rank = Column(Integer, default=0)  # finished bo'lganda yakuniy rank
    is_winner = Column(Boolean, default=False)
    joined_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        UniqueConstraint("contest_id", "user_id", name="uq_contest_user"),
        Index("ix_cp_contest_score", "contest_id", "score"),
    )


# ─── MINI GAMES ──────────────────────────────────────────────────────────────
class GameSession(Base):
    """Bitta o'yin sessiyasi — start_token anti-cheat uchun.

    Flow: client POST /games/start → server returns session_token + started_at
          client plays, then POST /games/finish with token + score
          server validates: token matches, time elapsed < max_seconds for game,
          score within bounds → records and awards XP.
    """
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    game_type = Column(String(20), nullable=False)  # "clicker" | "2048"
    session_token = Column(String(64), unique=True, nullable=False)
    score = Column(Integer, default=0, nullable=False)
    xp_earned = Column(Integer, default=0, nullable=False)
    duration_seconds = Column(Integer, default=0)
    status = Column(String(20), default="started")  # started | finished | abandoned | invalid
    started_at = Column(DateTime(timezone=True), default=_now)
    finished_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_gs_user_started", "user_id", "started_at"),
        Index("ix_gs_game_score", "game_type", "score"),
    )


class SpinPrize(Base):
    """Daily Spin g'ildirakdagi mukofotlar — admin sozlaydi."""
    __tablename__ = "spin_prizes"

    id = Column(Integer, primary_key=True)
    label = Column(String(100), nullable=False)         # "100 XP"
    label_ru = Column(String(100), default="")
    xp = Column(Integer, default=0, nullable=False)     # mukofot miqdori
    weight = Column(Integer, default=10, nullable=False)  # tushish ehtimoli vazni
    color = Column(String(10), default="#7C3AED")
    icon = Column(String(50), default="gift")
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=100)
    created_at = Column(DateTime(timezone=True), default=_now)


class SpinHistory(Base):
    """Foydalanuvchi qachon, nima yutgani — daily limit + analytics."""
    __tablename__ = "spin_history"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    prize_id = Column(Integer, ForeignKey("spin_prizes.id", ondelete="SET NULL"), nullable=True)
    prize_label = Column(String(100), default="")  # snapshot — admin keyinroq o'zgartirsa ham qoladi
    xp_won = Column(Integer, default=0)
    won_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_spin_user_time", "user_id", "won_at"),
    )


# ─── WISHLIST (mijoz reward'ni saqlab qo'yadi) ───────────────────────────────
class Wishlist(Base):
    __tablename__ = "wishlists"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reward_id = Column(Integer, ForeignKey("rewards.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_wishlist_user", "user_id"),
        Index("ix_wishlist_user_reward", "user_id", "reward_id", unique=True),
    )


# ─── HOLDING (bir nechta merchant'ni boshqaruvchi tashkilot) ─────────────────
class Holding(Base):
    __tablename__ = "holdings"

    id = Column(Integer, primary_key=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, default="")
    logo_url = Column(Text, default="")
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)


class HoldingMerchant(Base):
    """Holding tarkibidagi merchantlar (many-to-many)."""
    __tablename__ = "holding_merchants"

    id = Column(Integer, primary_key=True)
    holding_id = Column(Integer, ForeignKey("holdings.id", ondelete="CASCADE"), nullable=False)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_hm_holding", "holding_id"),
        Index("ix_hm_merchant_unique", "merchant_id", unique=True),
    )


class HoldingMember(Base):
    """Holding'ga kirish ruxsati bo'lgan foydalanuvchilar."""
    __tablename__ = "holding_members"

    id = Column(Integer, primary_key=True)
    holding_id = Column(Integer, ForeignKey("holdings.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String(30), default="director")  # director | viewer
    added_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_hmem_holding_user", "holding_id", "user_id", unique=True),
    )


# ── Landing CMS (admin paneldan tahrirlanadi) ─────────────────────────────────
class LandingLogo(Base):
    """Landing'dagi logolar.

    `category`:
      - "partner" — "Bizga ishonadigan biznes" bo'limi (default)
      - "pos"     — "Integratsiya qilingan POS tizimlari" bo'limi
    """
    __tablename__ = "landing_logos"

    id = Column(Integer, primary_key=True)
    name = Column(String(100), nullable=False)
    image_url = Column(Text, nullable=False)  # https://... yoki data:image/...
    href = Column(String(500), default="", nullable=False, server_default="")
    category = Column(String(20), default="partner", nullable=False, server_default="partner")
    sort_order = Column(Integer, default=0, nullable=False, server_default="0")
    is_active = Column(Boolean, default=True, nullable=False, server_default="true")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_landing_logos_cat_active_order", "category", "is_active", "sort_order"),
    )


class MerchantApiToken(Base):
    """Merchant tomonidan o'z saytiga / botiga integratsiya qilish uchun
    chiqarilgan **uzoq muddatli API tokeni**.

    JWT session token (`merchant_token`) emas — bu alohida, revokable, va
    panelda boshqarilishi mumkin bo'lgan token. Format:
        kar_live_<24 random url-safe chars>
    Token to'liq qiymati faqat yaratilgan paytda bir marta qaytariladi;
    DB'da SHA-256 hash sifatida saqlanadi (high-entropy uchun bcrypt shart emas).
    `token_prefix` UI ko'rsatish uchun (oxirgi 4-5 belgi maskalanadi):
        kar_live_aBcD1234……
    """
    __tablename__ = "merchant_api_tokens"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    token_prefix = Column(String(20), nullable=False)
    token_hash = Column(String(64), unique=True, nullable=False)  # sha256 hex
    last_used_at = Column(DateTime(timezone=True), nullable=True)
    last_used_ip = Column(String(45), default="", nullable=False, server_default="")
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    # Optional expiry. NULL = mangu (eski uslub, kelajakda default 90 kun bo'lishi mumkin).
    expires_at = Column(DateTime(timezone=True), nullable=True)
    # Brute-force himoya — notog'ri token urinishlari bo'yicha hisob
    # (token_hash topilmagan IP'lar uchun. Bizning token aslida hash bo'yicha
    # qidiriladi, shuning uchun "notog'ri token" — kar_live_ prefiksi bor
    # lekin DB'da yo'q. Lockout vaqtinchalik IP'ni ma'lumotini saqlaydi.)
    failed_attempts = Column(Integer, default=0, nullable=False, server_default="0")
    locked_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_api_tokens_merchant", "merchant_id"),
        Index("ix_api_tokens_hash", "token_hash", unique=True),
    )


class LoginAttempt(Base):
    """Brute-force himoyasi va audit uchun har bir login urinishi.

    `identifier` — kiritilgan email/username (Personal Identifiable bo'lishi
    mumkin, log retention bo'yicha 90 kunda tozalash tavsiya etiladi).
    `success=False` da `error_reason` qisqa kod (`bad_password`,
    `unknown_user`, `disabled`, `locked`, `rate_limited`).
    """
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True)
    identifier = Column(String(200), nullable=False)
    role = Column(String(20), nullable=False)              # merchant | admin | user
    user_id = Column(Integer, nullable=True)               # tekshirib bo'lgandan keyin to'ldiriladi
    success = Column(Boolean, default=False, nullable=False)
    error_reason = Column(String(40), default="", nullable=False, server_default="")
    ip = Column(String(45), default="", nullable=False, server_default="")
    user_agent = Column(String(500), default="", nullable=False, server_default="")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    __table_args__ = (
        Index("ix_login_attempts_identifier_time", "identifier", "created_at"),
        Index("ix_login_attempts_role_success_time", "role", "success", "created_at"),
    )


class PaymeTransaction(Base):
    """Payme (Paycom) JSON-RPC tranzaksiyalari.

    State machine (Payme protokoli):
        1   — created  (CreateTransaction qilindi, perform kutilmoqda)
        2   — performed (PerformTransaction muvaffaqiyatli)
       -1   — cancelled before perform
       -2   — cancelled after perform (refund)

    `paycom_id` — Payme tomonidan generatsiya qilingan UUID (idempotency key).
    `invoice_id` — Monvo Invoice'ga referent (account.order_id).
    `amount_tiyin` — Payme tiyin'da yuboradi (1 so'm = 100 tiyin).
    """
    __tablename__ = "payme_transactions"

    id = Column(Integer, primary_key=True)
    paycom_id = Column(String(64), unique=True, nullable=False)         # Payme transaction.id
    paycom_time_ms = Column(Integer, nullable=False)                    # Payme yuboradigan ms timestamp
    invoice_id = Column(Integer, ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="SET NULL"), nullable=True)
    amount_tiyin = Column(Integer, nullable=False)                      # tiyin (1 so'm = 100 tiyin)
    state = Column(Integer, default=1, nullable=False)                  # 1 | 2 | -1 | -2
    reason = Column(Integer, nullable=True)                             # Cancel sababi (Payme protokoli)
    create_time_ms = Column(Integer, nullable=True)
    perform_time_ms = Column(Integer, nullable=True)
    cancel_time_ms = Column(Integer, nullable=True)
    raw_account = Column(JSON, default=dict, nullable=False)            # account.* maydonlari
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_payme_invoice", "invoice_id"),
        Index("ix_payme_merchant_state", "merchant_id", "state"),
        Index("ix_payme_state_create", "state", "create_time_ms"),
    )


class LandingReview(Base):
    """Landing 'sharhlar' bo'limi uchun mijoz sharhlari + Schema.org review markup."""
    __tablename__ = "landing_reviews"

    id = Column(Integer, primary_key=True)
    quote_uz = Column(Text, nullable=False)
    quote_ru = Column(Text, default="", nullable=False, server_default="")
    author_name = Column(String(120), nullable=False)
    author_role_uz = Column(String(160), default="", nullable=False, server_default="")
    author_role_ru = Column(String(160), default="", nullable=False, server_default="")
    avatar_url = Column(Text, default="", nullable=False, server_default="")
    rating = Column(Integer, default=5, nullable=False, server_default="5")  # 1-5
    sort_order = Column(Integer, default=0, nullable=False, server_default="0")
    is_active = Column(Boolean, default=True, nullable=False, server_default="true")
    is_featured = Column(Boolean, default=False, nullable=False, server_default="false")
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_landing_reviews_active_order", "is_active", "sort_order"),
    )


# ── Outbound Webhooks ─────────────────────────────────────────────────────────

class MerchantWebhook(Base):
    """Merchant tomonidan sozlangan outbound webhook konfiguratsiyasi."""
    __tablename__ = "merchant_webhooks"

    id = Column(Integer, primary_key=True)
    merchant_id = Column(Integer, ForeignKey("merchants.id", ondelete="CASCADE"), nullable=False)
    url = Column(String(500), nullable=False)
    secret = Column(String(100), nullable=False)          # HMAC-SHA256 imzosi uchun
    description = Column(String(200), default="", nullable=False)
    events = Column(JSON, default=lambda: ["*"])          # ["*"] yoki ["transaction.earn", ...]
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)
    last_triggered_at = Column(DateTime(timezone=True), nullable=True)
    last_http_status = Column(Integer, nullable=True)
    last_error = Column(String(300), nullable=True)
    success_count = Column(Integer, default=0)
    fail_count = Column(Integer, default=0)

    __table_args__ = (
        Index("ix_merchant_webhooks_merchant", "merchant_id"),
    )


class WebhookDelivery(Base):
    """Har bir webhook yuborilish urinishi logi."""
    __tablename__ = "webhook_deliveries"

    id = Column(Integer, primary_key=True)
    webhook_id = Column(Integer, ForeignKey("merchant_webhooks.id", ondelete="CASCADE"), nullable=False)
    merchant_id = Column(Integer, nullable=False)
    event = Column(String(60), nullable=False)
    payload = Column(JSON, nullable=False)
    delivery_id = Column(String(36), nullable=False)      # UUID
    status = Column(String(20), default="pending")        # pending|retrying|delivered|dead
    attempt = Column(Integer, default=0)
    http_status = Column(Integer, nullable=True)
    response_body = Column(String(500), nullable=True)
    error = Column(String(300), nullable=True)
    next_retry_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index("ix_webhook_deliveries_webhook", "webhook_id"),
        Index("ix_webhook_deliveries_status_retry", "status", "next_retry_at"),
        Index("ix_webhook_deliveries_merchant", "merchant_id"),
    )


class LandingSocialLink(Base):
    """Sayt footer'idagi ijtimoiy tarmoq havolalari."""
    __tablename__ = "landing_social_links"

    id = Column(Integer, primary_key=True)
    platform = Column(String(30), nullable=False)   # telegram|instagram|facebook|youtube|x|tiktok|linkedin
    url = Column(String(500), nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    sort_order = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime(timezone=True), default=_now)


class CrashReport(Base):
    """Mobil ilovadan kelgan crash/xato hisoboti.

    Xatolar **imzo (signature)** bo'yicha guruhlanadi — bir xil xato qayta-qayta
    kelsa, yangi qator emas, mavjudining `occurrences` hisobi oshadi va so'nggi
    namuna (stack, versiya, qurilma) yangilanadi. Admin panelda sabab batafsil
    (to'liq stack-trace + breadcrumbs + kontekst) ko'rinadi.
    """
    __tablename__ = "crash_reports"

    id = Column(Integer, primary_key=True)
    signature = Column(String(64), unique=True, nullable=False, index=True)  # sha256(error_type+msg+top-frame)
    platform = Column(String(20), default="", nullable=False, server_default="")     # ios | android
    fatal = Column(Boolean, default=True, nullable=False, server_default="true")
    error_type = Column(String(200), default="", nullable=False, server_default="")  # exception klassi / "FlutterError"
    message = Column(Text, default="", nullable=False, server_default="")
    stack_trace = Column(Text, default="", nullable=False, server_default="")        # to'liq stack (so'nggi namuna)
    screen = Column(String(120), default="", nullable=False, server_default="")      # joriy ekran/route
    app_version = Column(String(40), default="", nullable=False, server_default="")
    os_version = Column(String(60), default="", nullable=False, server_default="")
    device_model = Column(String(120), default="", nullable=False, server_default="")
    breadcrumbs = Column(JSON, default=list)            # oxirgi amallar ro'yxati (so'nggi namuna)
    affected_versions = Column(JSON, default=list)      # ko'rilgan ilova versiyalari
    occurrences = Column(Integer, default=1, nullable=False, server_default="1")
    resolved = Column(Boolean, default=False, nullable=False, server_default="false")
    first_seen = Column(DateTime(timezone=True), default=_now)
    last_seen = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        Index("ix_crash_reports_last_seen", "last_seen"),
        Index("ix_crash_reports_resolved", "resolved"),
    )


# ── Telegram bot foydalanuvchilari (har ikki bot) ─────────────────────────────
class TelegramBotUser(Base):
    """Telegram bot bilan muloqotda bo'lgan foydalanuvchilar.

    `bot` — qaysi bot: 'customer' (Monvo user bot) yoki 'merchant'
    (@Monvo_business_bot). Har xabarda upsert qilinadi (first/last seen,
    message_count yangilanadi)."""
    __tablename__ = "telegram_bot_users"

    id = Column(Integer, primary_key=True)
    bot = Column(String(20), nullable=False)            # customer | merchant
    telegram_id = Column(String(50), nullable=False)
    username = Column(String(150), default="", nullable=False, server_default="")
    first_name = Column(String(200), default="", nullable=False, server_default="")
    last_name = Column(String(200), default="", nullable=False, server_default="")
    language_code = Column(String(10), default="", nullable=False, server_default="")
    message_count = Column(Integer, default=1, nullable=False, server_default="1")
    first_seen = Column(DateTime(timezone=True), default=_now)
    last_seen = Column(DateTime(timezone=True), default=_now)

    __table_args__ = (
        UniqueConstraint("bot", "telegram_id", name="uq_botuser_bot_tgid"),
        Index("ix_botuser_bot_lastseen", "bot", "last_seen"),
    )
