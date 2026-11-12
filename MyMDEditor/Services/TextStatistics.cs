namespace MyMDEditor.Services
{
    public readonly record struct TextStatistics(int Words, int Characters, int Lines, int ReadingMinutes)
    {
        private const int WordsPerMinute = 200;

        /// <summary>Single pass, allocation-free statistics that stay fast on multi-megabyte documents.</summary>
        public static TextStatistics Compute(string text)
        {
            if (string.IsNullOrEmpty(text))
            {
                return new TextStatistics(0, 0, 1, 0);
            }

            var words = 0;
            var lines = 1;
            var inWord = false;

            foreach (var c in text)
            {
                if (c == '\n')
                {
                    lines++;
                }

                if (char.IsWhiteSpace(c))
                {
                    inWord = false;
                }
                else if (!inWord)
                {
                    inWord = true;
                    words++;
                }
            }

            var minutes = words == 0 ? 0 : Math.Max(1, (int)Math.Ceiling(words / (double)WordsPerMinute));
            return new TextStatistics(words, text.Length, lines, minutes);
        }
    }
}
