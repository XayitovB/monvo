// i18n.js — uz/ru strings for the Telegram mini-app, mirroring the Flutter
// app's bilingual labels. Use t(lang, key) or the useT() hook from store.
const STR = {
  // ── Tabs / nav ──
  tabHome: { uz: 'Bosh sahifa', ru: 'Главная' },
  tabCards: { uz: 'Kartalar', ru: 'Карты' },
  tabPlaces: { uz: 'Joylar', ru: 'Места' },
  tabProfile: { uz: 'Profil', ru: 'Профиль' },

  // ── Common ──
  loading: { uz: 'Yuklanmoqda…', ru: 'Загрузка…' },
  retry: { uz: 'Qayta urinish', ru: 'Повторить' },
  error: { uz: 'Xatolik', ru: 'Ошибка' },
  netError: { uz: 'Tarmoq xatosi', ru: 'Ошибка сети' },
  all: { uz: 'Hammasi', ru: 'Все' },
  close: { uz: 'Yopish', ru: 'Закрыть' },
  cancel: { uz: 'Bekor qilish', ru: 'Отмена' },
  save: { uz: 'Saqlash', ru: 'Сохранить' },
  copied: { uz: 'Nusxalandi', ru: 'Скопировано' },
  som: { uz: "so'm", ru: 'сум' },
  back: { uz: 'Orqaga', ru: 'Назад' },

  // ── Home ──
  totalBalance: { uz: 'Umumiy balans', ru: 'Общий баланс' },
  cardsLabel: { uz: 'Kartalar', ru: 'Карт' },
  myCards: { uz: 'Mening kartalarim', ru: 'Мои карты' },
  seeAll: { uz: 'Barchasi', ru: 'Все' },
  addCard: { uz: "Qo'shish", ru: 'Добавить' },
  scanQr: { uz: 'QR skanerlash', ru: 'Сканировать QR' },

  // ── Cards ──
  noCards: { uz: 'Kartalar yoʻq', ru: 'Нет карт' },
  noCardsHint: {
    uz: "Biznesning QR kodini skanerlab birinchi kartangizni qoʻshing",
    ru: 'Отсканируйте QR бизнеса, чтобы добавить первую карту',
  },
  cashback: { uz: 'Keshbek', ru: 'Кешбэк' },

  // ── Card detail ──
  showQr: { uz: 'QR koʻrsatish', ru: 'Показать QR' },
  rewards: { uz: "Sovgʻalar", ru: 'Подарки' },
  history: { uz: 'Tarix', ru: 'История' },
  details: { uz: 'Tafsilotlar', ru: 'Детали' },
  cardId: { uz: 'Karta ID', ru: 'ID карты' },
  tier: { uz: 'Daraja', ru: 'Уровень' },

  // ── QR show ──
  yourQr: { uz: 'Sizning QR-kodingiz', ru: 'Ваш QR-код' },
  qrHint: {
    uz: "Keshbek qoʻshish yoki yechish uchun kodni kassirga koʻrsating.",
    ru: 'Покажите код кассиру для начисления или списания кешбэка.',
  },
  copyId: { uz: 'ID nusxalash', ru: 'Скопировать ID' },
  promoCode: { uz: 'Promokod', ru: 'Промокод' },
  promoErr: { uz: 'Kod yaratilmadi, qayta urinib koʻring', ru: 'Не удалось создать код, повторите' },
  promoHint: {
    uz: '3 daqiqa amal qiladi. Bu kodni kassirga ayting — keshbek qoʻshadi yoki yechadi.',
    ru: 'Действует 3 минуты. Назовите код кассиру — он начислит или спишет кешбэк.',
  },
  voucher: { uz: 'Voucher', ru: 'Ваучер' },
  voucherHint: {
    uz: "Billz kassasida kiriting",
    ru: 'введите на кассе Billz',
  },

  // ── Rewards ──
  rewardsTitle: { uz: "Sovgʻalar", ru: 'Подарки' },
  available: { uz: 'mavjud', ru: 'доступно' },
  searchReward: { uz: "Sovgʻa qidirish", ru: 'Найти подарок' },
  inStock: { uz: 'Mavjud', ru: 'В наличии' },
  noRewards: { uz: "Sovgʻalar topilmadi", ru: 'Подарки не найдены' },
  noRewardsHint: {
    uz: 'Tez orada yangi takliflar',
    ru: 'Скоро появятся новые предложения',
  },

  // ── Transactions ──
  historyTitle: { uz: 'Tarix', ru: 'История' },
  earns: { uz: "Qoʻshilishlar", ru: 'Начисления' },
  redeems: { uz: 'Yechimlar', ru: 'Списания' },
  today: { uz: 'Bugun', ru: 'Сегодня' },
  yesterday: { uz: 'Kecha', ru: 'Вчера' },
  emptyHistory: { uz: "Tarix boʻsh", ru: 'История пуста' },
  purchase: { uz: 'Xarid', ru: 'Покупка' },
  exchange: { uz: 'Almashish', ru: 'Обмен' },
  perMonth: { uz: 'oy ichida', ru: 'за месяц' },

  // ── Places ──
  placesTitle: { uz: 'Joylar', ru: 'Места' },
  mapTitle: { uz: 'Xarita', ru: 'Карта' },
  partners: { uz: 'Hamkorlar', ru: 'Партнёры' },
  placesOnMap: { uz: 'ta joy xaritada', ru: 'мест на карте' },
  nearby: { uz: 'Yaqin atrofda', ru: 'Рядом' },
  noBranches: { uz: 'Filiallar topilmadi', ru: 'Филиалы не найдены' },
  openMap: { uz: 'Xaritada ochish', ru: 'Открыть в картах' },
  loadFailed: { uz: "Yuklab boʻlmadi", ru: 'Не удалось загрузить' },
  km: { uz: 'km', ru: 'км' },
  call: { uz: "Qoʻngʻiroq", ru: 'Позвонить' },
  route: { uz: 'Yoʻnalish', ru: 'Маршрут' },

  // ── Notifications ──
  notifs: { uz: 'Bildirishnomalar', ru: 'Уведомления' },
  noNotifs: { uz: 'Bildirishnoma yoʻq', ru: 'Нет уведомлений' },
  readAll: { uz: "Hammasini oʻqilgan", ru: 'Прочитать все' },

  // ── Profile ──
  profileTitle: { uz: 'Profil', ru: 'Профиль' },
  settings: { uz: 'Sozlamalar', ru: 'Настройки' },
  language: { uz: 'Til', ru: 'Язык' },
  theme: { uz: 'Mavzu', ru: 'Тема' },
  themeLight: { uz: 'Yorugʻ', ru: 'Светлая' },
  themeDark: { uz: 'Tungi', ru: 'Тёмная' },
  themeSystem: { uz: 'Tizim', ru: 'Системная' },
  gamification: { uz: 'Yutuqlar', ru: 'Достижения' },
  games: { uz: 'Oʻyinlar', ru: 'Игры' },
  contests: { uz: 'Tanlovlar', ru: 'Конкурсы' },
  leaderboard: { uz: 'Reyting', ru: 'Рейтинг' },
  myStats: { uz: 'Statistikam', ru: 'Моя статистика' },
  birthday: { uz: "Tugʻilgan kun", ru: 'День рождения' },
  deleteAccount: { uz: "Hisobni oʻchirish", ru: 'Удалить аккаунт' },
  deleteConfirm: {
    uz: "Hisobingiz va barcha maʼlumotlar butunlay oʻchiriladi. Davom etilsinmi?",
    ru: 'Ваш аккаунт и все данные будут удалены навсегда. Продолжить?',
  },
  level: { uz: 'Daraja', ru: 'Уровень' },
  points: { uz: 'Ball', ru: 'Очки' },
  streak: { uz: 'Streak', ru: 'Серия' },
  days: { uz: 'kun', ru: 'дней' },

  // ── Gamification ──
  achievements: { uz: 'Yutuqlar', ru: 'Достижения' },
  unlocked: { uz: 'ochilgan', ru: 'открыто' },
  rank: { uz: 'Oʻrin', ru: 'Место' },
  you: { uz: 'Siz', ru: 'Вы' },

  // ── Contests ──
  join: { uz: 'Qatnashish', ru: 'Участвовать' },
  joined: { uz: 'Qatnashyapsiz', ru: 'Вы участвуете' },
  finished: { uz: 'Tugagan', ru: 'Завершён' },
  prize: { uz: 'Sovrin', ru: 'Приз' },
  noContests: { uz: 'Tanlovlar yoʻq', ru: 'Нет конкурсов' },

  // ── Games ──
  gamesHub: { uz: 'Oʻyinlar', ru: 'Игры' },
  spinWheel: { uz: 'Gʻildirak', ru: 'Колесо' },
  clicker: { uz: 'Klikker', ru: 'Кликер' },
  game2048: { uz: '2048', ru: '2048' },
  spin: { uz: 'Aylantirish', ru: 'Крутить' },
  play: { uz: "Oʻynash", ru: 'Играть' },
  attemptsLeft: { uz: 'urinish qoldi', ru: 'попыток осталось' },
  noAttempts: { uz: 'Urinishlar tugadi', ru: 'Попытки закончились' },
  comeBackTomorrow: { uz: 'Ertaga qaytib keling', ru: 'Возвращайтесь завтра' },
  score: { uz: 'Ochko', ru: 'Счёт' },
  youWon: { uz: 'Siz yutdingiz!', ru: 'Вы выиграли!' },
  gameOver: { uz: 'Oʻyin tugadi', ru: 'Игра окончена' },
  restart: { uz: 'Qayta', ru: 'Заново' },
  tapToEarn: { uz: 'Bosib ball yigʻing', ru: 'Нажимай и набирай очки' },

  // ── QR scanner ──
  scannerTitle: { uz: 'Skaner', ru: 'Сканер' },
  scanHint: { uz: "Kamerani kassa QR-koduga yoʻnaltiring", ru: 'Наведите камеру на QR-код кассы' },
  showMyQr: { uz: "Mening QR-kodimni koʻrsatish", ru: 'Показать мой QR' },
  camDenied: { uz: 'Kameraga ruxsat berilmagan', ru: 'Доступ к камере запрещён' },
  camDeniedDesc: {
    uz: "Telegram sozlamalarida Monvo uchun kameraga ruxsat bering va qayta urinib koʻring.",
    ru: 'Разрешите доступ к камере для Monvo в настройках Telegram и попробуйте снова.',
  },
  useTgScanner: { uz: 'Telegram skaneri', ru: 'Сканер Telegram' },
  qrWrong: { uz: "Bu Monvo QR-kodi emas", ru: 'Это не QR-код Monvo' },
  cardAdded: { uz: "Karta qoʻshildi", ru: 'Карта добавлена' },
  cardNotFound: { uz: 'Karta topilmadi', ru: 'Карта не найдена' },

  // ── Auth gate ──
  onlyTelegram: {
    uz: 'Bu ilova faqat Telegram orqali ochiladi',
    ru: 'Приложение открывается только через Telegram',
  },
}

export function t(lang, key, fallback) {
  const e = STR[key]
  if (!e) return fallback ?? key
  return e[lang === 'ru' ? 'ru' : 'uz'] ?? e.uz
}
