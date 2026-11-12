using MyMDEditor.Services;
using MyMDEditor.Services.Editing;

namespace MyMDEditor.Tests
{
    [TestClass]
    public sealed class OutlineServiceTests
    {
        private static readonly OutlineEntry[] Entries =
        {
            new(1, "Home", 0, 0),
            new(2, "Architecture", 5, 50),
            new(3, "Authentication", 10, 100),
            new(4, "OAuth Flow", 15, 150),
            new(2, "Deployment", 20, 200),
        };

        [TestMethod]
        public void BuildTree_NestsByLevel()
        {
            var roots = OutlineService.BuildTree(Entries);

            Assert.HasCount(1, roots);
            Assert.HasCount(2, roots[0].Children);
            Assert.AreEqual("OAuth Flow", roots[0].Children[0].Children[0].Children[0].Entry.Title);
            Assert.AreEqual("Deployment", roots[0].Children[1].Entry.Title);
            Assert.AreSame(roots[0], roots[0].Children[1].Parent);
        }

        [TestMethod]
        public void BuildTree_SkippedLevels_StillNest()
        {
            var roots = OutlineService.BuildTree(new[] { new OutlineEntry(1, "A", 0, 0), new OutlineEntry(3, "B", 1, 1), new OutlineEntry(2, "C", 2, 2) });

            Assert.HasCount(1, roots);
            CollectionAssert.AreEqual(new[] { "B", "C" }, roots[0].Children.Select(c => c.Entry.Title).ToArray());
        }

        [TestMethod]
        public void BuildTree_NoTopLevelHeading_MultipleRoots()
        {
            var roots = OutlineService.BuildTree(new[] { new OutlineEntry(2, "A", 0, 0), new OutlineEntry(2, "B", 1, 1) });

            Assert.HasCount(2, roots);
        }

        [TestMethod]
        public void FindCurrentIndex_ReturnsOwningHeading()
        {
            Assert.AreEqual(-1, OutlineService.FindCurrentIndex(Array.Empty<OutlineEntry>(), 3));
            Assert.AreEqual(0, OutlineService.FindCurrentIndex(Entries, 4));
            Assert.AreEqual(3, OutlineService.FindCurrentIndex(Entries, 17));
            Assert.AreEqual(4, OutlineService.FindCurrentIndex(Entries, 999));
            Assert.AreEqual(-1, OutlineService.FindCurrentIndex(new[] { new OutlineEntry(1, "x", 5, 0) }, 2));
        }

        [TestMethod]
        public void GetBreadcrumbIndices_ReturnsAncestorChain()
        {
            var chain = OutlineService.GetBreadcrumbIndices(Entries, 16).Select(i => Entries[i].Title);

            CollectionAssert.AreEqual(new[] { "Home", "Architecture", "Authentication", "OAuth Flow" }, chain.ToArray());
        }

        [TestMethod]
        public void GetBreadcrumbIndices_SiblingSection_DropsPreviousBranch()
        {
            var chain = OutlineService.GetBreadcrumbIndices(Entries, 21).Select(i => Entries[i].Title);

            CollectionAssert.AreEqual(new[] { "Home", "Deployment" }, chain.ToArray());
        }

        [TestMethod]
        public void GetSignature_IgnoresLineMoves_DetectsTitleChanges()
        {
            var moved = Entries.Select(e => e with { Line = e.Line + 1, Offset = e.Offset + 1 }).ToArray();
            var renamed = Entries.Select((e, i) => i == 2 ? e with { Title = "AuthN" } : e).ToArray();

            Assert.AreEqual(OutlineService.GetSignature(Entries), OutlineService.GetSignature(moved));
            Assert.AreNotEqual(OutlineService.GetSignature(Entries), OutlineService.GetSignature(renamed));
        }
    }

    [TestClass]
    public sealed class LineIndexTests
    {
        [TestMethod]
        public void Maps_OffsetsToLinesAndBack()
        {
            var index = new LineIndex("ab\ncd\n\nef");

            Assert.AreEqual(4, index.LineCount);
            Assert.AreEqual(0, index.GetLineFromOffset(2));
            Assert.AreEqual(1, index.GetLineFromOffset(3));
            Assert.AreEqual(2, index.GetLineFromOffset(6));
            Assert.AreEqual(3, index.GetLineFromOffset(9));
            Assert.AreEqual(7, index.GetLineStart(3));
            Assert.AreEqual(5, index.GetLineEnd(1));
            Assert.AreEqual(9, index.GetLineEnd(3));
            Assert.AreEqual(1, index.GetColumnFromOffset(4));
        }

        [TestMethod]
        public void OutOfRangeValues_AreClamped()
        {
            var index = new LineIndex("ab\ncd");

            Assert.AreEqual(0, index.GetLineFromOffset(-5));
            Assert.AreEqual(1, index.GetLineFromOffset(500));
            Assert.AreEqual(3, index.GetLineStart(99));
        }

        [TestMethod]
        public void EmptyText_HasSingleLine()
        {
            var index = new LineIndex(string.Empty);

            Assert.AreEqual(1, index.LineCount);
            Assert.AreEqual(0, index.GetLineEnd(0));
        }

        [TestMethod]
        public void CountLinesBefore_CountsNewlines()
        {
            Assert.AreEqual(2, LineIndex.CountLinesBefore("a\nb\nc", 4));
            Assert.AreEqual(2, LineIndex.CountLinesBefore("a\nb\nc", 400));
        }
    }

    [TestClass]
    public sealed class SourceLocatorTests
    {
        [TestMethod]
        public void FindInBlock_ExactText_IsLocated()
        {
            var source = "intro\n\nSome **bold** text here\n";
            var block = source.IndexOf("Some", StringComparison.Ordinal);

            var range = SourceLocator.FindInBlock(source, block, source.Length, "text here");

            Assert.IsNotNull(range);
            Assert.AreEqual(source.IndexOf("text here", StringComparison.Ordinal), range.Value.Start);
        }

        [TestMethod]
        public void FindInBlock_RenderedTextAcrossMarkup_IsLocated()
        {
            var source = "Some **bold** text\nnext line";

            var range = SourceLocator.FindInBlock(source, 0, source.Length, "bold text next");

            Assert.IsNotNull(range);
            Assert.AreEqual(source.IndexOf("bold", StringComparison.Ordinal), range.Value.Start);
            Assert.AreEqual("bold** text\nnext", source.Substring(range.Value.Start, range.Value.Length));
        }

        [TestMethod]
        public void FindInBlock_FallsBackToLongestWord()
        {
            var source = "| Name | Value |\n| --- | --- |\n| alpha | [link](u) |";

            var range = SourceLocator.FindInBlock(source, 0, source.Length, "something alpha zzz");

            Assert.IsNotNull(range);
            Assert.AreEqual(source.IndexOf("alpha", StringComparison.Ordinal), range.Value.Start);
        }

        [TestMethod]
        public void FindInBlock_NoHintOrMissing_ReturnsNull()
        {
            Assert.IsNull(SourceLocator.FindInBlock("abc", 0, 3, null));
            Assert.IsNull(SourceLocator.FindInBlock("abc", 0, 3, "xyz"));
            Assert.IsNull(SourceLocator.FindInBlock("abc", 5, 1, "abc"));
        }

        [TestMethod]
        public void GetOrdinalInParagraph_CountsPrecedingMatchesInSameParagraph()
        {
            var text = "foo\n\nfoo foo\nfoo";
            var matches = Services.Search.SearchEngine.Find(text, new Services.Search.SearchOptions("foo")).Matches;

            Assert.AreEqual(0, SourceLocator.GetOrdinalInParagraph(text, matches, 0));
            Assert.AreEqual(0, SourceLocator.GetOrdinalInParagraph(text, matches, 1));
            Assert.AreEqual(1, SourceLocator.GetOrdinalInParagraph(text, matches, 2));
            Assert.AreEqual(2, SourceLocator.GetOrdinalInParagraph(text, matches, 3));
        }
    }

    [TestClass]
    public sealed class FuzzyMatcherTests
    {
        [TestMethod]
        public void Score_NonSubsequence_IsNull()
        {
            Assert.IsNull(FuzzyMatcher.Score("xyz", "Authentication"));
        }

        [TestMethod]
        public void Score_Subsequence_IsMatched_CaseInsensitive()
        {
            Assert.IsNotNull(FuzzyMatcher.Score("oaf", "OAuth Flow"));
        }

        [TestMethod]
        public void Filter_RanksContiguousAndPrefixHigher()
        {
            var items = new[] { "Deployment", "Overview of auth", "Authentication", "OAuth Flow" };

            var result = FuzzyMatcher.Filter(items, "auth", s => s);

            Assert.AreEqual("Authentication", result[0]);
            Assert.HasCount(3, result);
        }

        [TestMethod]
        public void Filter_EmptyQuery_ReturnsAllInOrder()
        {
            var items = new[] { "b", "a" };

            CollectionAssert.AreEqual(items, FuzzyMatcher.Filter(items, " ", s => s).ToArray());
        }
    }

    [TestClass]
    public sealed class TextStatisticsTests
    {
        [TestMethod]
        public void Compute_CountsWordsLinesCharacters()
        {
            var stats = TextStatistics.Compute("Hello world\n\nthird  line ");

            Assert.AreEqual(4, stats.Words);
            Assert.AreEqual(3, stats.Lines);
            Assert.AreEqual(25, stats.Characters);
            Assert.AreEqual(1, stats.ReadingMinutes);
        }

        [TestMethod]
        public void Compute_Empty()
        {
            var stats = TextStatistics.Compute(string.Empty);

            Assert.AreEqual(0, stats.Words);
            Assert.AreEqual(1, stats.Lines);
            Assert.AreEqual(0, stats.ReadingMinutes);
        }
    }
}
