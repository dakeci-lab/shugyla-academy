Shugyla Market — фирменные ассеты для разработки
=================================================

fonts/
  Bluecurve-Light.ttf, Bluecurve-Regular.ttf, Bluecurve-Bold.ttf — фирменный шрифт (заголовки)
  Montserrat — подключается через Google Fonts (не входит в архив)

logo/
  logo-primary.png          — логотип на белом/светлом фоне (полноцветный wordmark)
  logo-on-green.png         — логотип для зелёного фона (белый текст + оранжевое солнце)
  logo-white-mono.png       — монохромный белый логотип (для оранжевого/тёмного фона, фото)
  icon-sunmark.png          — legacy знак-солнце (сейчас на careers success; часто с тёмным превью)
  icon-sunmark-source.png   — исходник sunmark от владельца (зелёный круг + оранжевые лучи)
  icon-sunmark-on-white.png — знак по центру на белом квадрате 512×512, с padding (~14% на сторону);
                              предпочитать для platform mark / favicon / PWA / splash на светлом фоне
  Wordmark вырезан из shugyla-брендбук.pdf; sunmark-source — фирменный файл владельца (2026-08-21).
  PWA icons (`public/icons/*`) генерируются из icon-sunmark-on-white.png: `node scripts/generate-pwa-icons.mjs`.

photos/
  photo-store-facade.jpg   — фасад магазина (hero hub + apply aside «Фото магазина»)
  photo-team-employee.jpg         — исходник (вертикаль), архив
  photo-team-employee-square.jpg  — квадратный кадр (лицо + форма); about + vacancy

pattern/
  pattern-tile.svg — фирменный паттерн, tileable, 108×112px, используй background-repeat

Цвета:
  --brand-green:    #14A752
  --brand-orange:   #F09718
  --brand-charcoal: #38342F
  --brand-cream:    #FFF2E9
  --brand-white:    #FFFFFF
