namespace MyMDEditor.Services
{
    /// <summary>A heading discovered in the document. <see cref="Line"/> is zero-based.</summary>
    public sealed record OutlineEntry(int Level, string Title, int Line, int Offset);

    /// <summary>Hierarchical view of an <see cref="OutlineEntry"/>, used by the tree view.</summary>
    public sealed class OutlineNode
    {
        public OutlineNode(OutlineEntry entry, int index)
        {
            Entry = entry;
            Index = index;
        }

        public OutlineEntry Entry { get; }

        /// <summary>Index into the flat entry list.</summary>
        public int Index { get; }

        public OutlineNode? Parent { get; internal set; }

        public List<OutlineNode> Children { get; } = new();
    }

    /// <summary>Pure helpers for outline trees, current-section lookup and breadcrumbs.</summary>
    public static class OutlineService
    {
        public static IReadOnlyList<OutlineNode> BuildTree(IReadOnlyList<OutlineEntry> entries)
        {
            var roots = new List<OutlineNode>();
            var stack = new Stack<OutlineNode>();

            for (var i = 0; i < entries.Count; i++)
            {
                var node = new OutlineNode(entries[i], i);

                while (stack.Count > 0 && stack.Peek().Entry.Level >= node.Entry.Level)
                {
                    stack.Pop();
                }

                if (stack.Count == 0)
                {
                    roots.Add(node);
                }
                else
                {
                    node.Parent = stack.Peek();
                    stack.Peek().Children.Add(node);
                }

                stack.Push(node);
            }

            return roots;
        }

        /// <summary>Index of the heading that owns <paramref name="line"/>, or -1 before the first heading.</summary>
        public static int FindCurrentIndex(IReadOnlyList<OutlineEntry> entries, int line)
        {
            int lo = 0, hi = entries.Count - 1, result = -1;
            while (lo <= hi)
            {
                var mid = (lo + hi) >>> 1;
                if (entries[mid].Line <= line)
                {
                    result = mid;
                    lo = mid + 1;
                }
                else
                {
                    hi = mid - 1;
                }
            }

            return result;
        }

        /// <summary>
        /// Returns the chain of headings (outermost first) that contain <paramref name="line"/>,
        /// e.g. Architecture, Authentication, OAuth Flow.
        /// </summary>
        public static IReadOnlyList<int> GetBreadcrumbIndices(IReadOnlyList<OutlineEntry> entries, int line)
        {
            var current = FindCurrentIndex(entries, line);
            if (current < 0)
            {
                return Array.Empty<int>();
            }

            var chain = new List<int> { current };
            var level = entries[current].Level;

            for (var i = current - 1; i >= 0 && level > 1; i--)
            {
                if (entries[i].Level < level)
                {
                    chain.Add(i);
                    level = entries[i].Level;
                }
            }

            chain.Reverse();
            return chain;
        }

        /// <summary>Cheap structural signature used to avoid rebuilding an unchanged outline tree.</summary>
        public static string GetSignature(IReadOnlyList<OutlineEntry> entries)
        {
            var hash = new HashCode();
            foreach (var e in entries)
            {
                hash.Add(e.Level);
                hash.Add(e.Title, StringComparer.Ordinal);
            }

            return $"{entries.Count}:{hash.ToHashCode()}";
        }
    }
}
