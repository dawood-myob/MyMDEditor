using System.Text;

namespace MyMDEditor.Services.Editing
{
    /// <summary>Selection/cursor range inside a pipe-table line (content only, padding excluded).</summary>
    public readonly record struct CellRange(int Start, int Length);

    /// <summary>Pure helpers for formatting and navigating GitHub-style pipe tables.</summary>
    public static class TableEditor
    {
        public static bool LooksLikeRow(string line) => !string.IsNullOrWhiteSpace(line) && line.Contains('|');

        public static bool IsDelimiterRow(string line)
        {
            if (!LooksLikeRow(line))
            {
                return false;
            }

            var cells = SplitCells(line);
            return cells.Count > 0 && cells.All(c => IsDelimiterCell(c.Trim()));
        }

        private static bool IsDelimiterCell(string cell)
        {
            if (cell.Length == 0)
            {
                return false;
            }

            var body = cell.Trim(':');
            return body.Length >= 1 && body.All(c => c == '-') && cell.Count(c => c == ':') <= 2;
        }

        /// <summary>Finds the contiguous table block (inclusive line range) containing <paramref name="line"/>.</summary>
        public static (int Start, int End)? FindTable(IReadOnlyList<string> lines, int line)
        {
            if (line < 0 || line >= lines.Count || !LooksLikeRow(lines[line]))
            {
                return null;
            }

            var start = line;
            while (start > 0 && LooksLikeRow(lines[start - 1]))
            {
                start--;
            }

            var end = line;
            while (end + 1 < lines.Count && LooksLikeRow(lines[end + 1]))
            {
                end++;
            }

            // A table needs a header row followed by a delimiter row.
            return end > start && IsDelimiterRow(lines[start + 1]) ? (start, end) : null;
        }

        /// <summary>Splits a row into raw (untrimmed) cells, honouring escaped pipes and code spans.</summary>
        public static List<string> SplitCells(string line)
        {
            var pipes = GetPipePositions(line);
            var cells = new List<string>();
            for (var i = 0; i + 1 < pipes.Count; i++)
            {
                cells.Add(line.Substring(pipes[i] + 1, pipes[i + 1] - pipes[i] - 1));
            }

            return cells;
        }

        /// <summary>
        /// Positions of cell separators, adding virtual separators at -1 and line end when the
        /// row has no leading/trailing pipe.
        /// </summary>
        private static List<int> GetPipePositions(string line)
        {
            var pipes = new List<int>();
            var inCode = false;
            for (var i = 0; i < line.Length; i++)
            {
                var c = line[i];
                if (c == '\\' && i + 1 < line.Length)
                {
                    i++;
                }
                else if (c == '`')
                {
                    inCode = !inCode;
                }
                else if (c == '|' && !inCode)
                {
                    pipes.Add(i);
                }
            }

            var firstContent = 0;
            while (firstContent < line.Length && char.IsWhiteSpace(line[firstContent]))
            {
                firstContent++;
            }

            if (pipes.Count == 0 || pipes[0] != firstContent)
            {
                pipes.Insert(0, -1);
            }

            var lastContent = line.Length - 1;
            while (lastContent >= 0 && char.IsWhiteSpace(line[lastContent]))
            {
                lastContent--;
            }

            if (pipes[^1] != lastContent || pipes.Count == 1)
            {
                pipes.Add(line.Length);
            }

            return pipes;
        }

        /// <summary>Returns the content range (trimmed) of each cell in the line.</summary>
        public static List<CellRange> GetCellRanges(string line)
        {
            var pipes = GetPipePositions(line);
            var ranges = new List<CellRange>();
            for (var i = 0; i + 1 < pipes.Count; i++)
            {
                var start = pipes[i] + 1;
                var end = pipes[i + 1];
                while (start < end && char.IsWhiteSpace(line[start]))
                {
                    start++;
                }

                while (end > start && char.IsWhiteSpace(line[end - 1]))
                {
                    end--;
                }

                if (end == start)
                {
                    // Empty cell: park the caret inside the padding rather than on a pipe.
                    start = Math.Min(pipes[i] + 2, pipes[i + 1]);
                    end = start;
                }

                ranges.Add(new CellRange(start, end - start));
            }

            return ranges;
        }

        /// <summary>Zero-based index of the cell containing <paramref name="column"/>.</summary>
        public static int GetCellIndex(string line, int column)
        {
            var pipes = GetPipePositions(line);
            for (var i = 0; i + 1 < pipes.Count; i++)
            {
                if (column <= pipes[i + 1])
                {
                    return i;
                }
            }

            return Math.Max(0, pipes.Count - 2);
        }

        /// <summary>Aligns every column of the table; returns new lines of equal visual width per column.</summary>
        public static string[] Format(IReadOnlyList<string> tableLines)
        {
            var rows = tableLines.Select(l => SplitCells(l).Select(c => c.Trim()).ToList()).ToList();
            var columnCount = rows.Max(r => r.Count);
            foreach (var row in rows)
            {
                while (row.Count < columnCount)
                {
                    row.Add(string.Empty);
                }
            }

            var delimiterIndex = rows.Count > 1 && IsDelimiterRow(tableLines[1]) ? 1 : -1;
            var alignments = new char[columnCount]; // 'l', 'c', 'r' or '\0' (default)
            if (delimiterIndex >= 0)
            {
                for (var c = 0; c < columnCount; c++)
                {
                    var cell = rows[delimiterIndex][c];
                    var left = cell.StartsWith(':');
                    var right = cell.EndsWith(':');
                    alignments[c] = left && right ? 'c' : right ? 'r' : left ? 'l' : '\0';
                }
            }

            var widths = new int[columnCount];
            for (var c = 0; c < columnCount; c++)
            {
                widths[c] = 3;
                for (var r = 0; r < rows.Count; r++)
                {
                    if (r != delimiterIndex)
                    {
                        widths[c] = Math.Max(widths[c], rows[r][c].Length);
                    }
                }
            }

            var result = new string[rows.Count];
            for (var r = 0; r < rows.Count; r++)
            {
                var builder = new StringBuilder("|");
                for (var c = 0; c < columnCount; c++)
                {
                    builder.Append(' ');
                    if (r == delimiterIndex)
                    {
                        builder.Append(BuildDelimiter(widths[c], alignments[c]));
                    }
                    else
                    {
                        builder.Append(Pad(rows[r][c], widths[c], alignments[c]));
                    }

                    builder.Append(" |");
                }

                result[r] = builder.ToString();
            }

            return result;
        }

        private static string BuildDelimiter(int width, char alignment) => alignment switch
        {
            'c' => ":" + new string('-', width - 2) + ":",
            'r' => new string('-', width - 1) + ":",
            'l' => ":" + new string('-', width - 1),
            _ => new string('-', width)
        };

        private static string Pad(string text, int width, char alignment)
        {
            var gap = width - text.Length;
            return alignment switch
            {
                'r' => new string(' ', gap) + text,
                'c' => new string(' ', gap / 2) + text + new string(' ', gap - gap / 2),
                _ => text + new string(' ', gap)
            };
        }

        /// <summary>Builds an empty row that matches the column count of the table.</summary>
        public static string BuildEmptyRow(string templateLine)
        {
            var count = Math.Max(1, SplitCells(templateLine).Count);
            return "|" + string.Concat(Enumerable.Repeat("  |", count));
        }

        /// <summary>
        /// Computes where Tab / Shift+Tab should move the caret. Returns the target line and cell
        /// range, or null when the caret is already at the table boundary in that direction.
        /// </summary>
        public static (int Line, CellRange Cell)? Navigate(IReadOnlyList<string> lines, int tableStart, int tableEnd, int line, int column, bool forward)
        {
            var ranges = GetCellRanges(lines[line]);
            var current = Math.Min(GetCellIndex(lines[line], column), ranges.Count - 1);
            var targetLine = line;
            var targetCell = current + (forward ? 1 : -1);

            if (targetCell >= ranges.Count)
            {
                targetLine = NextDataRow(lines, tableStart, tableEnd, line, +1);
                targetCell = 0;
            }
            else if (targetCell < 0)
            {
                targetLine = NextDataRow(lines, tableStart, tableEnd, line, -1);
                targetCell = targetLine < 0 ? 0 : GetCellRanges(lines[targetLine]).Count - 1;
            }

            if (targetLine < 0)
            {
                return null;
            }

            var targetRanges = GetCellRanges(lines[targetLine]);
            return targetCell < targetRanges.Count ? (targetLine, targetRanges[targetCell]) : null;
        }

        private static int NextDataRow(IReadOnlyList<string> lines, int start, int end, int from, int direction)
        {
            for (var i = from + direction; i >= start && i <= end; i += direction)
            {
                if (!IsDelimiterRow(lines[i]))
                {
                    return i;
                }
            }

            return -1;
        }
    }
}
