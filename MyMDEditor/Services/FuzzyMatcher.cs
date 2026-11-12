namespace MyMDEditor.Services
{
    /// <summary>Lightweight subsequence fuzzy matching for the quick-jump / command palette.</summary>
    public static class FuzzyMatcher
    {
        /// <summary>
        /// Returns a score (higher is better) when every query character appears in order in the candidate,
        /// otherwise null. Consecutive runs, word starts and prefix matches score higher.
        /// </summary>
        public static int? Score(string query, string candidate)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return 0;
            }

            if (string.IsNullOrEmpty(candidate))
            {
                return null;
            }

            var q = query.Replace(" ", string.Empty);
            var score = 0;
            var ci = 0;
            var previousMatch = -2;

            foreach (var qc in q)
            {
                var found = -1;
                for (var i = ci; i < candidate.Length; i++)
                {
                    if (char.ToUpperInvariant(candidate[i]) == char.ToUpperInvariant(qc))
                    {
                        found = i;
                        break;
                    }
                }

                if (found < 0)
                {
                    return null;
                }

                score += 1;
                if (found == previousMatch + 1)
                {
                    score += 5;
                }

                if (found == 0)
                {
                    score += 8;
                }
                else if (!char.IsLetterOrDigit(candidate[found - 1]) || (char.IsLower(candidate[found - 1]) && char.IsUpper(candidate[found])))
                {
                    score += 4;
                }

                previousMatch = found;
                ci = found + 1;
            }

            if (candidate.Contains(query.Trim(), StringComparison.OrdinalIgnoreCase))
            {
                score += 10;
            }

            // Prefer shorter candidates when scores tie.
            return score * 100 - Math.Min(candidate.Length, 99);
        }

        public static IReadOnlyList<T> Filter<T>(IEnumerable<T> items, string query, Func<T, string> label)
        {
            if (string.IsNullOrWhiteSpace(query))
            {
                return items.ToList();
            }

            return items
                .Select((item, index) => (item, index, score: Score(query, label(item))))
                .Where(x => x.score.HasValue)
                .OrderByDescending(x => x.score)
                .ThenBy(x => x.index)
                .Select(x => x.item)
                .ToList();
        }
    }
}
