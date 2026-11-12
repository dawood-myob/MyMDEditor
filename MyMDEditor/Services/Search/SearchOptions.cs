using System.Text.RegularExpressions;

namespace MyMDEditor.Services.Search
{
    /// <summary>Describes a search request: the query and how it should be interpreted.</summary>
    public sealed record SearchOptions(
        string Query,
        bool CaseSensitive = false,
        bool WholeWord = false,
        bool UseRegex = false)
    {
        public bool IsEmpty => string.IsNullOrEmpty(Query);

        /// <summary>
        /// Builds the .NET regular expression pattern for this request.
        /// Plain-text queries are escaped; whole-word uses look-arounds so that
        /// queries starting/ending with punctuation still behave sensibly.
        /// </summary>
        public string ToRegexPattern()
        {
            var core = UseRegex ? Query : Regex.Escape(Query);
            return WholeWord ? $@"(?<![\p{{L}}\p{{N}}_])(?:{core})(?![\p{{L}}\p{{N}}_])" : core;
        }

        public RegexOptions ToRegexOptions()
        {
            var options = RegexOptions.CultureInvariant | RegexOptions.Multiline;
            if (!CaseSensitive)
            {
                options |= RegexOptions.IgnoreCase;
            }

            return options;
        }

        /// <summary>True when a plain ordinal scan can be used instead of the regex engine.</summary>
        public bool CanUseOrdinalScan => !UseRegex && !WholeWord;
    }
}
