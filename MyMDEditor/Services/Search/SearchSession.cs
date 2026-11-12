namespace MyMDEditor.Services.Search
{
    /// <summary>
    /// Holds a search result set plus the "current" match and provides wrap-around navigation.
    /// </summary>
    public sealed class SearchSession
    {
        public SearchSession(SearchResult result)
        {
            Result = result ?? SearchResult.Empty;
            CurrentIndex = -1;
        }

        public SearchResult Result { get; }

        public IReadOnlyList<MatchRange> Matches => Result.Matches;

        public int Count => Matches.Count;

        /// <summary>Zero-based index of the current match, or -1 when none is selected.</summary>
        public int CurrentIndex { get; private set; }

        public MatchRange? Current => CurrentIndex >= 0 && CurrentIndex < Count ? Matches[CurrentIndex] : null;

        public bool Select(int index)
        {
            if (index < 0 || index >= Count)
            {
                return false;
            }

            CurrentIndex = index;
            return true;
        }

        /// <summary>Selects the first match at or after <paramref name="offset"/> (wrapping to the first match).</summary>
        public bool SelectNearestForward(int offset)
        {
            if (Count == 0)
            {
                CurrentIndex = -1;
                return false;
            }

            var index = LowerBound(offset);
            CurrentIndex = index >= Count ? 0 : index;
            return true;
        }

        /// <summary>Selects the last match that starts before <paramref name="offset"/> (wrapping to the last match).</summary>
        public bool SelectNearestBackward(int offset)
        {
            if (Count == 0)
            {
                CurrentIndex = -1;
                return false;
            }

            var index = LowerBound(offset) - 1;
            CurrentIndex = index < 0 ? Count - 1 : index;
            return true;
        }

        public bool MoveNext()
        {
            if (Count == 0)
            {
                return false;
            }

            CurrentIndex = CurrentIndex < 0 ? 0 : (CurrentIndex + 1) % Count;
            return true;
        }

        public bool MovePrevious()
        {
            if (Count == 0)
            {
                return false;
            }

            CurrentIndex = CurrentIndex <= 0 ? Count - 1 : CurrentIndex - 1;
            return true;
        }

        /// <summary>Human-readable status such as "7 of 23 matches".</summary>
        public string Describe()
        {
            if (Result.Error is not null)
            {
                return Result.Error;
            }

            var suffix = Result.Truncated ? "+" : string.Empty;
            if (Count == 0)
            {
                return "No results";
            }

            var noun = Count == 1 && !Result.Truncated ? "match" : "matches";
            return CurrentIndex >= 0
                ? $"{CurrentIndex + 1} of {Count:N0}{suffix} {noun}"
                : $"{Count:N0}{suffix} {noun}";
        }

        // First index whose Start >= offset.
        private int LowerBound(int offset)
        {
            int lo = 0, hi = Count;
            while (lo < hi)
            {
                var mid = (lo + hi) >>> 1;
                if (Matches[mid].Start < offset)
                {
                    lo = mid + 1;
                }
                else
                {
                    hi = mid;
                }
            }

            return lo;
        }
    }
}
