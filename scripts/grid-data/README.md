# Bundled chart calibration

`references.json` lists independently read (row, column) examples for each literal code, in original image coordinates. Coordinates are one-based. The generator combines background samples with printed glyph shapes; it does not use stock amounts or quota-constrained reassignment.

`reviewed-cells.json` records literal review of the 209 nearly identical H18/H19 cells in 招财邦布, and the watermark-only exterior cell (46,52) in 蕾米埃尔. The low-resolution H18/H19 glyphs were reviewed in enlarged original crops; the last ambiguous H19 at (7,38) was checked using its lower-left open digit stroke. Full cell crops matter because tightly cropping a three-character code can truncate its final digit.

The six images are fixed calibration inputs; `grids.json` stores their SHA-256 hashes. A changed image requires re-calibration. Existing uploaded charts do not receive an inferred map simply because their name or usage matches.

Rebuild offline: `python3 scripts/build-bead-grids.py` (Pillow, numpy, scipy). Each independent usage table is only checked after positions have been assigned. Generation fails on any discrepancy and never changes cells to force the printed count. No OCR service or model key is needed by the generated guide.
