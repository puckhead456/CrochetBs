// js/patterns.js
// window.Patterns — crochet pattern-text parser. Pure functions, no DOM.
'use strict';

(function () {

  // ---------------------------------------------------------------------
  // Row / round marker detection
  // ---------------------------------------------------------------------

  // Keyword-prefixed markers: "Rnd 5", "Rnd5", "Round 5", "R5", "R 5",
  // "Row 5", "Rows 5-8", "Rnds 6–10", "Rnd 5 to 8", optional leading
  // bullet ("-", "*", "•") and whitespace.
  // Alternation order matters: longer keywords must be tried before the
  // bare "r" so "round"/"rows" etc. are matched in full rather than just
  // their leading "r".
  var KEYWORD_RE = /^\s*[-*•]?\s*(?:rnds?|rounds?|rows?|r)\.?\s*(\d+)(?:\s*(?:-|–|—|to)\s*(\d+))?/i;

  // Bare numeric markers: "5.", "5:", "5)", "12. ..." — the digits must be
  // IMMEDIATELY followed by one of . : ) (no space), so that ordinary
  // pattern text like "5 sc in next st" or "6 inc around" is never
  // mistaken for a row marker.
  var BARE_RE = /^\s*[-*•]?\s*(\d+)[.):]/;

  // Returns { row, rowEnd, rest } where `rest` is the remainder of the line
  // AFTER the row-marker match (or the whole line, if there was no marker).
  // Stitch-count detection is run only against `rest` so that a range's own
  // end number (e.g. the "10" in "Rnd 6-10") can never be mistaken for a
  // trailing stitch count on a marker-only line.
  function detectRow(trimmedLine) {
    var m = KEYWORD_RE.exec(trimmedLine);
    if (m) {
      var row = parseInt(m[1], 10);
      var rowEnd = (m[2] !== undefined) ? parseInt(m[2], 10) : row;
      return { row: row, rowEnd: rowEnd, rest: trimmedLine.slice(m[0].length) };
    }
    var m2 = BARE_RE.exec(trimmedLine);
    if (m2) {
      var row2 = parseInt(m2[1], 10);
      return { row: row2, rowEnd: row2, rest: trimmedLine.slice(m2[0].length) };
    }
    return { row: null, rowEnd: null, rest: trimmedLine };
  }

  // ---------------------------------------------------------------------
  // Stitch count detection (end of line)
  // ---------------------------------------------------------------------

  // Content allowed inside a trailing bracket for it to count as a stitch
  // total, e.g. "30", "30 sts", "30 sc", "30 stitches", "30 sts total",
  // "24, 30" (take the last number). Rejects non-count parentheticals like
  // "(make 2)".
  var BRACKET_CONTENT_RE = /^(?:\d+\s*,\s*)*(\d+)\s*(?:(?:sts?|stitches?|sc|total)\s*)*$/i;

  // Trailing "(...)" or "[...]" group, allowing trailing punctuation/space
  // after the closing bracket.
  var BRACKET_TAIL_RE = /[(\[]\s*([^()\[\]]*?)\s*[)\]]\s*[.,;!]*\s*$/;

  var EQUALS_TAIL_RE = /=\s*(\d+)\s*(?:sts?|stitches?)?\s*[.,;!]*\s*$/i;

  var DASH_TAIL_RE = /[-–—]\s*(\d+)\s*(?:sts?|stitches?)?\s*[.,;!]*\s*$/i;

  var PLAIN_TAIL_RE = /(\d+)\s*(?:sts?|stitches?)\s*[.,;!]*\s*$/i;

  function detectStitches(trimmedLine) {
    var bracket = BRACKET_TAIL_RE.exec(trimmedLine);
    if (bracket) {
      var inner = bracket[1].trim();
      var contentMatch = BRACKET_CONTENT_RE.exec(inner);
      if (contentMatch) {
        return parseInt(contentMatch[1], 10);
      }
      // Bracket present but not count-like (e.g. "(make 2)") — fall
      // through and try the other trailing formats against the full line.
    }

    var eq = EQUALS_TAIL_RE.exec(trimmedLine);
    if (eq) return parseInt(eq[1], 10);

    var dash = DASH_TAIL_RE.exec(trimmedLine);
    if (dash) return parseInt(dash[1], 10);

    var plain = PLAIN_TAIL_RE.exec(trimmedLine);
    if (plain) return parseInt(plain[1], 10);

    return null;
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  function parse(text) {
    if (text === null || text === undefined) return [];
    var rawLines = String(text).split(/\r\n|\r|\n/);
    var lines = [];
    for (var i = 0; i < rawLines.length; i++) {
      var raw = rawLines[i];
      var trimmed = raw.trim();
      var rowInfo = detectRow(trimmed);
      var stitches = detectStitches(rowInfo.rest);
      lines.push({
        index: i,
        text: raw,
        row: rowInfo.row,
        rowEnd: rowInfo.rowEnd,
        stitches: stitches
      });
    }
    return lines;
  }

  function inRange(line, rowNumber) {
    if (!line || line.row === null || line.row === undefined) return false;
    var end = (line.rowEnd !== null && line.rowEnd !== undefined) ? line.rowEnd : line.row;
    return rowNumber >= line.row && rowNumber <= end;
  }

  function targetFor(lines, rowNumber) {
    if (!lines) return null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (inRange(l, rowNumber) && l.stitches !== null && l.stitches !== undefined) {
        return l.stitches;
      }
    }
    return null;
  }

  function lineFor(lines, rowNumber) {
    if (!lines) return null;
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (inRange(l, rowNumber)) return l;
    }
    return null;
  }

  function summary(lines) {
    var rows = 0;
    var maxRow = null;
    var hasTargets = false;
    if (lines) {
      for (var i = 0; i < lines.length; i++) {
        var l = lines[i];
        if (l.row !== null && l.row !== undefined) {
          var end = (l.rowEnd !== null && l.rowEnd !== undefined) ? l.rowEnd : l.row;
          rows += (end - l.row + 1);
          if (maxRow === null || end > maxRow) maxRow = end;
        }
        if (l.stitches !== null && l.stitches !== undefined) hasTargets = true;
      }
    }
    return { rows: rows, maxRow: maxRow, hasTargets: hasTargets };
  }

  window.Patterns = {
    parse: parse,
    targetFor: targetFor,
    lineFor: lineFor,
    summary: summary
  };

})();
