using System.Text;
using System.Text.RegularExpressions;

namespace MyMDEditor.Services.Search
{
    public readonly record struct MatchRange(int Start, int Length)
    {
        public int End => Start + Length;
    }

    public sealed record SearchResult(IReadOnlyList<MatchRange> Matches, string? Error = null, bool Truncated = false)
    {
        public static SearchResult Empty { get; } = new(Array.Empty<MatchRange>());
    }

    /// <summary>
    /// Stateless text search/replace engine supporting case sensitivity, whole-word and regex modes.
    /// All operations are safe to run on a background thread and honour cancellation.
    /// </summary>
    public static class SearchEngine
    {
        public const int DefaultMaxMatches = 100_000;
        private static readonly TimeSpan RegexTimeout = TimeSpan.FromSeconds(2);

        public static SearchResult Find(
            string text,
            SearchOptions options,
            int maxMatches = DefaultMaxMatches,
            CancellationToken cancellationToken = default)
        {
            if (options is null || options.IsEmpty || string.IsNullOrEmpty(text))
            {
                return SearchResult.Empty;
            }

            try
            {
                return options.CanUseOrdinalScan
                    ? FindOrdinal(text, options, maxMatches, cancellationToken)
                    : FindRegex(text, options, maxMatches, cancellationToken);
            }
            catch (ArgumentException ex) when (options.UseRegex)
            {
                return new SearchResult(Array.Empty<MatchRange>(), $"Invalid regular expression: {ex.Message}");
            }
            catch (RegexMatchTimeoutException)
            {
                return new SearchResult(Array.Empty<MatchRange>(), "The regular expression took too long to evaluate.");
            }
        }

        private static SearchResult FindOrdinal(string text, SearchOptions options, int maxMatches, CancellationToken ct)
        {
            var comparison = options.CaseSensitive ? StringComparison.Ordinal : StringComparison.OrdinalIgnoreCase;
            var matches = new List<MatchRange>();
            var position = 0;

            while (position <= text.Length - options.Query.Length)
            {
                var index = text.IndexOf(options.Query, position, comparison);
                if (index < 0)
                {
                    break;
                }

                if (matches.Count >= maxMatches)
                {
                    return new SearchResult(matches, Truncated: true);
                }

                matches.Add(new MatchRange(index, options.Query.Length));
                position = index + options.Query.Length;

                if ((matches.Count & 0xFF) == 0)
                {
                    ct.ThrowIfCancellationRequested();
                }
            }

            return new SearchResult(matches);
        }

        private static SearchResult FindRegex(string text, SearchOptions options, int maxMatches, CancellationToken ct)
        {
            var regex = CreateRegex(options);
            var matches = new List<MatchRange>();

            for (var match = regex.Match(text); match.Success; match = match.NextMatch())
            {
                if (match.Length == 0)
                {
                    continue;
                }

                if (matches.Count >= maxMatches)
                {
                    return new SearchResult(matches, Truncated: true);
                }

                matches.Add(new MatchRange(match.Index, match.Length));

                if ((matches.Count & 0xFF) == 0)
                {
                    ct.ThrowIfCancellationRequested();
                }
            }

            return new SearchResult(matches);
        }

        /// <summary>Validates a request, returning an error message or null when the query is usable.</summary>
        public static string? Validate(SearchOptions options)
        {
            if (options is null || options.IsEmpty || !options.UseRegex)
            {
                return null;
            }

            try
            {
                _ = CreateRegex(options);
                return null;
            }
            catch (ArgumentException ex)
            {
                return $"Invalid regular expression: {ex.Message}";
            }
        }

        /// <summary>Computes the replacement text for a single match (expanding $1 etc. in regex mode).</summary>
        public static string GetReplacement(string text, MatchRange match, SearchOptions options, string replacement)
        {
            if (!options.UseRegex)
            {
                return replacement;
            }

            var regex = CreateRegex(options);
            var m = regex.Match(text, match.Start);
            return m.Success && m.Index == match.Start ? m.Result(replacement) : replacement;
        }

        /// <summary>Replaces every match and returns the new text and the number of replacements made.</summary>
        public static (string Text, int Count) ReplaceAll(
            string text,
            SearchOptions options,
            string replacement,
            CancellationToken cancellationToken = default)
        {
            if (options is null || options.IsEmpty || string.IsNullOrEmpty(text))
            {
                return (text, 0);
            }

            replacement ??= string.Empty;
            var builder = new StringBuilder(text.Length);
            var last = 0;
            var count = 0;

            if (options.CanUseOrdinalScan)
            {
                foreach (var m in Find(text, options, int.MaxValue, cancellationToken).Matches)
                {
                    builder.Append(text, last, m.Start - last).Append(replacement);
                    last = m.End;
                    count++;
                }
            }
            else
            {
                var regex = CreateRegex(options);
                for (var m = regex.Match(text); m.Success; m = m.NextMatch())
                {
                    if (m.Length == 0)
                    {
                        continue;
                    }

                    builder.Append(text, last, m.Index - last).Append(m.Result(replacement));
                    last = m.Index + m.Length;
                    count++;
                    if ((count & 0xFF) == 0)
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                    }
                }
            }

            if (count == 0)
            {
                return (text, 0);
            }

            builder.Append(text, last, text.Length - last);
            return (builder.ToString(), count);
        }

        private static Regex CreateRegex(SearchOptions options) =>
            new(options.ToRegexPattern(), options.ToRegexOptions(), RegexTimeout);
    }
}
