using System.Text.RegularExpressions;
using MyMDEditor.Services.Search;

namespace MyMDEditor.Services.Editing
{
    /// <summary>Maps rendered-preview selections back to ranges in the Markdown source.</summary>
    public static class SourceLocator
    {
        /// <summary>
        /// Looks for the text the user selected (or clicked) inside the source block. The rendered text lacks
        /// Markdown syntax, so progressively looser strategies are attempted before giving up.
        /// </summary>
        public static MatchRange? FindInBlock(string source, int blockStart, int blockEnd, string? hint)
        {
            blockStart = Math.Clamp(blockStart, 0, source.Length);
            blockEnd = Math.Clamp(blockEnd, blockStart, source.Length);
            if (string.IsNullOrWhiteSpace(hint) || blockEnd <= blockStart)
            {
                return null;
            }

            var block = source.AsSpan(blockStart, blockEnd - blockStart);
            var trimmed = hint.Trim();

            var index = block.IndexOf(trimmed, StringComparison.Ordinal);
            if (index >= 0)
            {
                return new MatchRange(blockStart + index, trimmed.Length);
            }

            // Whitespace in rendered text (soft breaks, table cells) rarely equals source whitespace.
            var words = trimmed.Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
            if (words.Length > 1)
            {
                var pattern = string.Join(@"[\s>*_~`|#-]+", words.Select(Regex.Escape));
                var match = Regex.Match(source.Substring(blockStart, blockEnd - blockStart), pattern, RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(250));
                if (match.Success)
                {
                    return new MatchRange(blockStart + match.Index, match.Length);
                }
            }

            // Last resort: the longest word, so the caret lands near the interesting text.
            foreach (var word in words.OrderByDescending(w => w.Length))
            {
                if (word.Length < 3)
                {
                    break;
                }

                index = block.IndexOf(word, StringComparison.Ordinal);
                if (index >= 0)
                {
                    return new MatchRange(blockStart + index, word.Length);
                }
            }

            return null;
        }

        /// <summary>Start offset of the blank-line-delimited paragraph containing <paramref name="offset"/>.</summary>
        public static int GetParagraphStart(string text, int offset)
        {
            offset = Math.Clamp(offset, 0, text.Length);
            var pos = text.LastIndexOf("\n\n", Math.Max(0, offset - 1), StringComparison.Ordinal);
            return pos < 0 || pos >= offset ? 0 : pos + 2;
        }

        /// <summary>Number of matches inside the same paragraph that occur before <paramref name="matchIndex"/>.</summary>
        public static int GetOrdinalInParagraph(string text, IReadOnlyList<MatchRange> matches, int matchIndex)
        {
            if (matchIndex <= 0 || matchIndex >= matches.Count)
            {
                return 0;
            }

            var paragraphStart = GetParagraphStart(text, matches[matchIndex].Start);
            var ordinal = 0;
            for (var i = matchIndex - 1; i >= 0 && matches[i].Start >= paragraphStart; i--)
            {
                ordinal++;
            }

            return ordinal;
        }
    }
}
