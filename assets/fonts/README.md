# Bundled fonts

The five display faces of the `theme` global's heading-font menu, plus Inter for OG images. All are SIL Open
Font License 1.1 (texts in `LICENSES/`), which allows bundling and redistribution. The manifest is
`lib/theme/fonts.ts`; the `next/font/local` declarations are `lib/theme/font-faces.ts` (a test keeps them in step).

Per face there are two files:

- `<Name>-<weight>.ttf`: static TrueType. satori (`next/og`) cannot read woff2 or variable fonts, so image routes read these.
- `<Name>-<weight>.woff2`: Latin plus Latin-extended subset for the web (`next/font/local`).

Source: https://github.com/google/fonts (`ofl/<family>/`), the same releases Google Fonts serves. Downloaded 2026-10-04.

| Face | Source file | Bundled |
| --- | --- | --- |
| Barlow Condensed | `BarlowCondensed-Medium/SemiBold/Bold.ttf` (static upstream) | 500, 600, 700 copied as is |
| Bebas Neue | `BebasNeue-Regular.ttf` | 400 |
| Anton | `Anton-Regular.ttf` | 400 |
| Oswald | `Oswald[wght].ttf` (variable only) | 500, 700 cut with the instancer |
| Playfair Display | `PlayfairDisplay[wght].ttf` (variable only) | 700 cut with the instancer |
| Inter (OG body only) | `Inter[opsz,wght].ttf` (variable only) | 400, 700 cut with the instancer, Latin subset |

## Commands

Variable fonts are cut to static weights, then subset:

```sh
fonttools varLib.instancer "Oswald[wght].ttf" wght=700 -o Oswald-700.ttf
fonttools varLib.instancer "Oswald[wght].ttf" wght=500 -o Oswald-500.ttf
fonttools varLib.instancer "PlayfairDisplay[wght].ttf" wght=700 -o PlayfairDisplay-700.ttf
fonttools varLib.instancer "Inter[opsz,wght].ttf" wght=400 opsz=14 -o Inter-400.ttf   # and wght=700
U="U+0000-00FF,U+0100-024F,U+1E00-1EFF,U+2000-206F,U+20AC,U+2122"
pyftsubset Inter-400.ttf --unicodes="$U" --layout-features='*' --output-file=Inter-400.ttf   # Inter OG files only (size)
for f in *.ttf; do pyftsubset "$f" --flavor=woff2 --unicodes="$U" --layout-features='*' --output-file="${f%.ttf}.woff2"; done
```

The other `.ttf` files are kept unsubsetted. Inter's `.ttf` are subset to the same Latin ranges to stay inside
the 2 MB budget that `tests/theme-fonts.test.ts` enforces. To add a face: add the files and licence, an entry in
`FONT_MENU` and `FONT_KEYS`, a `localFont` call in `font-faces.ts` and a migration extending the Postgres
enum `enum_theme_heading_font`.
