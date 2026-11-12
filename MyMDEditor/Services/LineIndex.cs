namespace MyMDEditor.Services
{
    /// <summary>
    /// Maps between character offsets and logical (newline-delimited) zero-based line numbers.
    /// A RichTextBox reports wrapped (visual) lines, so source mapping must never rely on it.
    /// </summary>
    public sealed class LineIndex
    {
        private readonly int[] _lineStarts;

        public LineIndex(string text)
        {
            text ??= string.Empty;
            Length = text.Length;

            var starts = new List<int> { 0 };
            for (var i = 0; i < text.Length; i++)
            {
                if (text[i] == '\n')
                {
                    starts.Add(i + 1);
                }
            }

            _lineStarts = starts.ToArray();
        }

        public int Length { get; }

        public int LineCount => _lineStarts.Length;

        public int GetLineStart(int line) => _lineStarts[Math.Clamp(line, 0, _lineStarts.Length - 1)];

        /// <summary>Offset of the first character after the line's content (before its newline).</summary>
        public int GetLineEnd(int line)
        {
            line = Math.Clamp(line, 0, _lineStarts.Length - 1);
            if (line + 1 >= _lineStarts.Length)
            {
                return Length;
            }

            var end = _lineStarts[line + 1] - 1;
            return end;
        }

        public int GetLineFromOffset(int offset)
        {
            offset = Math.Clamp(offset, 0, Length);
            var index = Array.BinarySearch(_lineStarts, offset);
            return index >= 0 ? index : ~index - 1;
        }

        public int GetColumnFromOffset(int offset)
        {
            offset = Math.Clamp(offset, 0, Length);
            return offset - _lineStarts[GetLineFromOffset(offset)];
        }

        /// <summary>Counts newlines before <paramref name="offset"/> without building an index.</summary>
        public static int CountLinesBefore(string text, int offset)
        {
            offset = Math.Clamp(offset, 0, text.Length);
            var count = 0;
            var span = text.AsSpan(0, offset);
            foreach (var c in span)
            {
                if (c == '\n')
                {
                    count++;
                }
            }

            return count;
        }
    }
}
