using System.Text.RegularExpressions;

namespace MyMDEditor.Services.Editing
{
    /// <summary>A replacement of <see cref="Length"/> characters at <see cref="Start"/> with <see cref="Text"/>.</summary>
    public readonly record struct TextEdit(int Start, int Length, string Text);

    /// <summary>Result of pressing Enter inside a list or blockquote line.</summary>
    public readonly record struct EnterEdit(string InsertText, bool ClearLine);

    /// <summary>Pure line-oriented editing helpers (lists, quotes, indentation, line prefixes).</summary>
    public static partial class LineOperations
    {
        [GeneratedRegex(@"^(?<indent>[ \t]*)(?<marker>(?:[-*+]|\d{1,9}[.)]))(?<space>[ \t]+)(?<task>\[[ xX]\][ \t]+)?")]
        private static partial Regex ListMarker();

        [GeneratedRegex(@"^(?<indent>[ \t]*)(?<quote>(?:>[ \t]?)+)")]
        private static partial Regex QuoteMarker();

        public static bool IsListItem(string line) => ListMarker().IsMatch(line);

        /// <summary>
        /// Decides what Enter should do on <paramref name="line"/> with the caret at <paramref name="column"/>.
        /// Returns null when the default behaviour (plain newline) applies.
        /// </summary>
        public static EnterEdit? GetEnterEdit(string line, int column)
        {
            var list = ListMarker().Match(line);
            if (list.Success)
            {
                if (column < list.Length)
                {
                    return null;
                }

                if (line.Substring(list.Length).Trim().Length == 0)
                {
                    // Pressing Enter on an empty item ends the list.
                    return new EnterEdit(string.Empty, ClearLine: true);
                }

                var marker = list.Groups["marker"].Value;
                var next = marker;
                if (char.IsDigit(marker[0]))
                {
                    var delimiter = marker[^1];
                    var number = long.Parse(marker[..^1]) + 1;
                    next = number + delimiter.ToString();
                }

                var task = list.Groups["task"].Success ? "[ ] " : string.Empty;
                return new EnterEdit("\n" + list.Groups["indent"].Value + next + " " + task, ClearLine: false);
            }

            var quote = QuoteMarker().Match(line);
            if (quote.Success && column >= quote.Length)
            {
                return line.Substring(quote.Length).Trim().Length == 0
                    ? new EnterEdit(string.Empty, ClearLine: true)
                    : new EnterEdit("\n" + quote.Value, ClearLine: false);
            }

            return null;
        }

        /// <summary>Indents a line; list items use a marker-aware width so nesting renders correctly.</summary>
        public static string IndentLine(string line)
        {
            var list = ListMarker().Match(line);
            if (list.Success)
            {
                var width = char.IsDigit(list.Groups["marker"].Value[0]) ? 3 : 2;
                return new string(' ', width) + line;
            }

            return line.Length == 0 ? line : "    " + line;
        }

        public static string OutdentLine(string line)
        {
            if (line.StartsWith('\t'))
            {
                return line[1..];
            }

            var remove = 0;
            while (remove < 4 && remove < line.Length && line[remove] == ' ')
            {
                remove++;
            }

            return line[remove..];
        }

        /// <summary>
        /// Applies <paramref name="transform"/> to every line touched by the selection. A selection that ends
        /// at the very start of a line does not include that line. Positions refer to LF-normalised text.
        /// </summary>
        public static TextEdit TransformLines(string text, int selectionStart, int selectionLength, Func<string[], string[]> transform)
        {
            var index = new LineIndex(text);
            var firstLine = index.GetLineFromOffset(selectionStart);
            var selectionEnd = selectionStart + selectionLength;
            var lastLine = index.GetLineFromOffset(selectionEnd);
            if (selectionLength > 0 && lastLine > firstLine && index.GetLineStart(lastLine) == selectionEnd)
            {
                lastLine--;
            }

            var start = index.GetLineStart(firstLine);
            var end = index.GetLineEnd(lastLine);
            var original = text.Substring(start, end - start).Split('\n');
            var result = transform(original);
            return new TextEdit(start, end - start, string.Join("\n", result));
        }

        /// <summary>
        /// Toggles a line prefix (heading, bullet, quote). Existing mutually-exclusive prefixes
        /// (e.g. other heading levels) are removed first.
        /// </summary>
        public static TextEdit PrefixLines(string text, int selectionStart, int selectionLength, string prefix, string[]? exclusivePrefixes = null)
        {
            return TransformLines(text, selectionStart, selectionLength, lines =>
            {
                var allHavePrefix = lines.All(l => l.StartsWith(prefix, StringComparison.Ordinal));
                return lines.Select(line =>
                {
                    if (allHavePrefix)
                    {
                        return line[prefix.Length..];
                    }

                    var current = line;
                    if (exclusivePrefixes is not null)
                    {
                        foreach (var existing in exclusivePrefixes.OrderByDescending(p => p.Length))
                        {
                            if (current.StartsWith(existing, StringComparison.Ordinal))
                            {
                                current = current[existing.Length..];
                                break;
                            }
                        }
                    }

                    return allHavePrefix ? current : prefix + current;
                }).ToArray();
            });
        }

        public static TextEdit NumberLines(string text, int selectionStart, int selectionLength)
        {
            return TransformLines(text, selectionStart, selectionLength, lines =>
            {
                var allNumbered = lines.All(l => Regex.IsMatch(l, @"^\d+\.\s"));
                return lines.Select((line, i) =>
                    allNumbered ? Regex.Replace(line, @"^\d+\.\s", string.Empty) : $"{i + 1}. {line}").ToArray();
            });
        }
    }
}
