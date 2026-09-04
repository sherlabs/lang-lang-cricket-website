#!/bin/bash
set -e
cd "$(dirname "$0")"

BASE="https://static.wixstatic.com/media"
FILES="https://www.langlangcricketclub.com/_files/ugd"

dl() { curl -sL "$1" -o "$2" && echo "OK $2" || echo "FAIL $2"; }

# Branding
dl "$BASE/768ffa_4be61ef378bf4f41978d1ac224a3c153~mv2.png" branding/logo.png
dl "$BASE/768ffa_23a0b79eac1146cf918cce23ded21feb~mv2.jpg" branding/hero.jpg

# Gallery
i=1
for id in \
  768ffa_56df5c19356f44f79715b14713b84a8a \
  768ffa_85f37f84889e49a0806d5264c14c30a5 \
  768ffa_927e1cacbc60477e93c59fff9a7492b9 \
  768ffa_293a5096802a435ba6c86d240b95e734 \
  768ffa_27e33ffb79ca4a0bb08a5ac2b278127b \
  768ffa_a9737bf414f145549b9880e634822b5b \
  768ffa_23a0b79eac1146cf918cce23ded21feb \
  768ffa_fc397b1e573b47098eba62b592c1ae10 \
  768ffa_fd606353791f4b5fbaba718421e15750 \
  768ffa_1b94f207db6d4f438fe7fa6b67b1704c \
  768ffa_cbe892183fb54438a5135589668b1a99 \
  768ffa_5910ad084dcb404782091537c70171ac \
  768ffa_9d36252b61564c69a1bb5a34174d9fe4 \
  768ffa_6a5595bba3ba4d2b91090c7b58478727 \
  768ffa_833db8c7fa6b4c34a98e0c4f8870e20e \
  768ffa_b8e33c000d4c481cbb5c47b48753da65 ; do
  dl "$BASE/${id}~mv2.jpg" "gallery/photo-$(printf %02d $i).jpg"
  i=$((i+1))
done

# Sponsors
dl "$BASE/768ffa_122714b007cf4983b75f9863fd0964ef~mv2.png" sponsors/platinum-01.png
dl "$BASE/768ffa_9949c258cb1f4e3383904fb8830f22d4~mv2.png" sponsors/gold-01.png
dl "$BASE/768ffa_9219365c912d40049c3313fc4343f2db~mv2.png" sponsors/gold-02.png
dl "$BASE/768ffa_7d4c475de4744500bf16d1a206ccc8af~mv2.png" sponsors/gold-03.png
dl "$BASE/768ffa_4da3aea0cf264cfbb596a422491882ab~mv2.png" sponsors/gold-04.png
dl "$BASE/768ffa_dde061b5daab4a19a75e2011e42fc3c0~mv2.png" sponsors/gold-05.png
dl "$BASE/768ffa_3dc527924a3c4d95a06ef1694e9eef96~mv2.png" sponsors/gold-06.png
dl "$BASE/768ffa_41a600de5b8442c78d24818c31f66b6f~mv2.jpg" sponsors/silver-01.jpg
dl "$BASE/768ffa_bbd63df7a4f943d89b3c8b7281bf206d~mv2.png" sponsors/silver-02.png
dl "$BASE/768ffa_284aefa55d0146dfb4303740d6a87af6~mv2.jpg" sponsors/silver-03.jpg
dl "$BASE/768ffa_65df89ed50fc4233aea9319838e99a51~mv2.jpg" sponsors/silver-04.jpg

# Documents & Policies PDFs
dl "$FILES/768ffa_a0fa31e93bd146549b0aaa0f655bccd1.pdf" documents/ccca-general-code-of-conduct.pdf
dl "$FILES/768ffa_718e4c984f28402a95dd2fc313eebd8c.pdf" documents/ccca-junior-code-of-conduct.pdf
dl "$FILES/768ffa_bd9d9fbeea6b4a65aebabba8351dd9d8.pdf" documents/ccca-parent-code-of-conduct.pdf
dl "$FILES/768ffa_9023d6ced0ab47178a19a4795f80633b.pdf" documents/ccca-extreme-weather-policy.pdf
dl "$FILES/768ffa_3ab5c5fdee624a16ae1ca0d2457ad410.pdf" documents/ccca-social-media-policy.pdf
dl "$FILES/768ffa_f7632dd8096742338a4cf64dabe5c31b.pdf" documents/ccca-wwcc-policy.pdf
dl "$FILES/768ffa_43e34e868a9d4e9dbe749899c618a0ee.pdf" documents/cv-complaints-resolution-policy-2024.pdf
dl "$FILES/768ffa_0a24b1cad30d45318059a055049a70ec.pdf" documents/cv-smoke-pollution-guidelines.pdf
dl "$FILES/768ffa_12c1f227c6dd47cf9f1ad913ed00a04a.pdf" documents/cv-suspect-bowling-actions-guidelines.pdf
dl "$FILES/768ffa_a4ed52a23af147f2b438118bd492c8fd.pdf" documents/betrayal-of-trust-fact-sheet.pdf
dl "$FILES/d652a2_1ea2237796a64c6583e8efa1e0a86996.pdf" documents/llcc-conflict-resolution-policy.pdf
dl "$FILES/768ffa_d4102b2bd94e4ad7b938c019054540ac.pdf" documents/safeguarding-children-policy.pdf
dl "$FILES/768ffa_4f2c588b98fb420eb834b70d5cdfcad8.pdf" documents/safeguarding-commitment.pdf
dl "$FILES/768ffa_ef60b49ea3114f5b8ac93424215be8c0.pdf" documents/code-of-behaviour-affiliated-clubs.pdf
dl "$FILES/768ffa_1262c925c75f4e6da9dd252296ebf5d7.pdf" documents/game-day-training-checklist.pdf
dl "$FILES/768ffa_05e9c02378b74239b12a53d6c95fd108.pdf" documents/ccca-directory-25-26.pdf

echo "ALL DONE"
